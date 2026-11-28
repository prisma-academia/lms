import { prisma } from "@/lib/db/client";
import { sealSecret, openSecret } from "@/lib/crypto/secret-box";
import { safeFetch } from "@/lib/integrations/safe-fetch";
import { configOf, markOk, openSecrets } from "@/lib/integrations/store";
import { isSsoProvider, providerInfo } from "@/lib/integrations/registry";
import { newPkceVerifier, pkceChallengeS256, randomToken, formBody, safeEqual } from "@/lib/integrations/oauth";
import { GOOGLE_ISSUER, decodeJwtPayload, discover, emailDomainAllowed, entraIssuer, validateIdTokenClaims, type IdTokenIdentity, type OidcDiscovery } from "@/lib/integrations/oidc";
import { tenantHttpOrigin } from "@/lib/url/tenant";
import type { TenantIntegration } from "@/lib/generated/prisma/client";

/**
 * Single sign-on with OpenID Connect, per academy. Authorization code + PKCE
 * (S256) + nonce, hand-built (PRD §9). The in-flight values (state, nonce,
 * verifier) travel in a short-lived HttpOnly cookie sealed with secret-box,
 * so nothing is stored server-side and the browser cannot read or alter them.
 */

export type SsoAudience = "learner" | "staff";
export type SsoSettings = {
  issuer: string;
  clientId: string;
  audience: "learners" | "staff" | "both";
  allowedDomains: string[];
  jit: boolean;
  buttonLabel: string;
};

export const SSO_COOKIE = "__mt-sso";
export const SSO_COOKIE_PATH = "/api/sso";
const FLOW_AAD = "sso-flow";
const FLOW_TTL_SEC = 600;

export function ssoRedirectUri(slug: string): string {
  return `${tenantHttpOrigin(slug)}/api/sso/callback`;
}

export function ssoSettings(row: Pick<TenantIntegration, "provider" | "configJson" | "name">): SsoSettings {
  const c = configOf(row);
  const issuer =
    row.provider === "oidc_google"
      ? GOOGLE_ISSUER
      : row.provider === "oidc_entra"
        ? entraIssuer(String(c.directoryId ?? ""))
        : String(c.issuer ?? "").replace(/\/+$/, "");
  const audience = c.audience === "staff" || c.audience === "both" ? c.audience : "learners";
  const domains = Array.isArray(c.allowedDomains) ? c.allowedDomains.filter((d): d is string => typeof d === "string" && d.length > 0) : [];
  const fallback = `Sign in with ${row.name || providerInfo(row.provider)?.name || "SSO"}`;
  return {
    issuer,
    clientId: String(c.clientId ?? ""),
    audience,
    allowedDomains: domains,
    jit: c.jit === true,
    buttonLabel: typeof c.buttonLabel === "string" && c.buttonLabel.trim() ? c.buttonLabel.trim() : fallback,
  };
}

export function audienceAllowed(settings: SsoSettings, audience: SsoAudience): boolean {
  return settings.audience === "both" || (audience === "learner" ? settings.audience === "learners" : settings.audience === "staff");
}

/** The issuer's endpoints, cached on the row for a day. Call inside tenant context. */
export async function ensureDiscovery(row: TenantIntegration, opts: { fresh?: boolean } = {}): Promise<OidcDiscovery> {
  const c = configOf(row);
  const cached = c.discovery as OidcDiscovery | undefined;
  const at = typeof c.discoveredAt === "string" ? Date.parse(c.discoveredAt) : 0;
  if (!opts.fresh && cached?.token_endpoint && Date.now() - at < 24 * 3600_000) return cached;
  const settings = ssoSettings(row);
  const doc = await discover(settings.issuer);
  await markOk(row.id, { config: { ...c, discovery: doc, discoveredAt: new Date().toISOString() } });
  return doc;
}

/** Enabled SSO buttons for a login page. Call inside tenant context. */
export async function ssoButtons(tenantId: string, audience: SsoAudience): Promise<{ id: string; label: string; provider: string }[]> {
  const rows = await prisma.tenantIntegration.findMany({
    where: { tenantId, provider: { in: ["oidc_google", "oidc_entra", "oidc_generic"] }, status: { in: ["CONNECTED", "ERROR"] } },
    orderBy: { createdAt: "asc" },
  });
  return rows
    .map((r) => ({ r, s: ssoSettings(r) }))
    .filter(({ s }) => audienceAllowed(s, audience) && s.clientId)
    .map(({ r, s }) => ({ id: r.id, label: s.buttonLabel, provider: r.provider }));
}

type Flow = { i: string; t: string; a: SsoAudience; s: string; n: string; v: string; x: number; next: string | null };

export function sealFlow(flow: Omit<Flow, "x">): string {
  return sealSecret(JSON.stringify({ ...flow, x: Math.floor(Date.now() / 1000) + FLOW_TTL_SEC }), FLOW_AAD);
}

export function openFlow(sealed: string | undefined): Flow | null {
  if (!sealed) return null;
  try {
    const f = JSON.parse(openSecret(sealed, FLOW_AAD)) as Flow;
    if (!f || typeof f.x !== "number" || f.x < Math.floor(Date.now() / 1000)) return null;
    return f;
  } catch {
    return null;
  }
}

export const FLOW_COOKIE_MAX_AGE = FLOW_TTL_SEC;

/** Build the IdP redirect and the sealed cookie for a new sign-in. */
export async function startSso(
  row: TenantIntegration,
  tenant: { id: string; slug: string },
  audience: SsoAudience,
  next: string | null
): Promise<{ location: string; cookie: string }> {
  const settings = ssoSettings(row);
  const doc = await ensureDiscovery(row);
  const state = randomToken();
  const nonce = randomToken();
  const verifier = newPkceVerifier();
  const u = new URL(doc.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", settings.clientId);
  u.searchParams.set("redirect_uri", ssoRedirectUri(tenant.slug));
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("nonce", nonce);
  u.searchParams.set("code_challenge", pkceChallengeS256(verifier));
  u.searchParams.set("code_challenge_method", "S256");
  if (row.provider === "oidc_google") {
    u.searchParams.set("prompt", "select_account");
    // A hint only — the domain is enforced on the way back.
    if (settings.allowedDomains.length === 1) u.searchParams.set("hd", settings.allowedDomains[0]);
  }
  const cookie = sealFlow({ i: row.id, t: tenant.id, a: audience, s: state, n: nonce, v: verifier, next });
  return { location: u.toString(), cookie };
}

export type SsoOutcome =
  | { ok: true; identity: IdTokenIdentity & { email: string }; settings: SsoSettings; row: TenantIntegration }
  | { ok: false; reason: string; detail?: string };

/** Exchange the code, validate the ID token. Call inside tenant context. */
export async function finishSso(row: TenantIntegration, flow: Flow, input: { code: string; state: string; slug: string }): Promise<SsoOutcome> {
  if (!safeEqual(input.state, flow.s)) return { ok: false, reason: "state_mismatch" };
  if (!isSsoProvider(row.provider)) return { ok: false, reason: "not_sso" };
  const settings = ssoSettings(row);
  const doc = await ensureDiscovery(row);
  let secret: string;
  try {
    secret = openSecrets(row).clientSecret ?? "";
  } catch {
    return { ok: false, reason: "config", detail: "The client secret could not be decrypted." };
  }

  const methods = doc.token_endpoint_auth_methods_supported;
  const useBasic = Array.isArray(methods) && !methods.includes("client_secret_post") && methods.includes("client_secret_basic");
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (useBasic) {
    headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(settings.clientId)}:${encodeURIComponent(secret)}`).toString("base64")}`;
  }
  const res = await safeFetch(doc.token_endpoint, {
    method: "POST",
    headers,
    body: formBody({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: ssoRedirectUri(input.slug),
      code_verifier: flow.v,
      ...(useBasic ? {} : { client_id: settings.clientId, client_secret: secret }),
    }),
  });
  if (res.status !== 200) return { ok: false, reason: "token_exchange", detail: `The identity provider answered ${res.status}: ${res.body.slice(0, 200)}` };
  let tokens: { id_token?: string; access_token?: string };
  try {
    tokens = JSON.parse(res.body) as { id_token?: string; access_token?: string };
  } catch {
    return { ok: false, reason: "token_exchange", detail: "The token response is not JSON." };
  }
  if (!tokens.id_token) return { ok: false, reason: "no_id_token" };

  let claims: Record<string, unknown>;
  try {
    claims = decodeJwtPayload(tokens.id_token);
  } catch (err) {
    return { ok: false, reason: "bad_id_token", detail: err instanceof Error ? err.message : undefined };
  }
  const check = validateIdTokenClaims(claims, { issuer: doc.issuer, clientId: settings.clientId, nonce: flow.n, nowSec: Math.floor(Date.now() / 1000) });
  if (!check.ok) return { ok: false, reason: check.reason };
  let identity = check.identity;

  // No email in the token: ask the userinfo endpoint (same TLS trust).
  if (!identity.email && doc.userinfo_endpoint && tokens.access_token) {
    try {
      const ui = await safeFetch(doc.userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.access_token}`, accept: "application/json" } });
      if (ui.status === 200) {
        const j = JSON.parse(ui.body) as { sub?: string; email?: string; email_verified?: boolean | string };
        const verified = j.email_verified === undefined ? null : j.email_verified === true || j.email_verified === "true";
        if (j.sub === identity.subject && typeof j.email === "string" && verified !== false) {
          identity = { ...identity, email: j.email.toLowerCase(), emailVerified: verified };
        }
      }
    } catch {
      // Fall through to "no email".
    }
  }
  if (!identity.email) return { ok: false, reason: "no_email" };
  if (!emailDomainAllowed(identity.email, settings.allowedDomains)) return { ok: false, reason: "domain_not_allowed" };
  return { ok: true, identity: { ...identity, email: identity.email }, settings, row };
}
