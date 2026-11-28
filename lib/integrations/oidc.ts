import { safeFetch } from "@/lib/integrations/safe-fetch";

/**
 * OpenID Connect pieces for single sign-on, hand-built (PRD §9, §16.4).
 *
 * The ID token is taken from the token endpoint's response, fetched directly
 * by the server over TLS with our client secret. OIDC Core §3.1.3.7 (6)
 * allows the TLS server validation to stand in for checking the token's
 * signature in exactly this case, so no JWT / JWKS library is involved: the
 * payload is decoded by hand and its claims are validated below (iss, aud,
 * azp, exp, iat, nonce, email_verified).
 */

export type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  token_endpoint_auth_methods_supported?: string[];
  end_session_endpoint?: string;
};

export const GOOGLE_ISSUER = "https://accounts.google.com";

export function entraIssuer(directory: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(directory.trim())}/v2.0`;
}

/** Fetch and sanity-check `<issuer>/.well-known/openid-configuration`. */
export async function discover(issuer: string): Promise<OidcDiscovery> {
  const base = issuer.replace(/\/+$/, "");
  const res = await safeFetch(`${base}/.well-known/openid-configuration`, { headers: { accept: "application/json" } }, { maxBytes: 256 * 1024 });
  if (res.status !== 200) throw new Error(`Discovery failed: the issuer answered ${res.status}.`);
  let doc: Partial<OidcDiscovery>;
  try {
    doc = JSON.parse(res.body) as Partial<OidcDiscovery>;
  } catch {
    throw new Error("Discovery failed: the issuer's configuration is not JSON.");
  }
  if (!doc.issuer || !doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error("Discovery failed: the configuration has no issuer, authorization_endpoint or token_endpoint.");
  }
  // OIDC Discovery §4.3: the issuer in the document must be the one asked for.
  // Entra's documents name the directory GUID; when the academy typed a domain
  // name instead, the GUID form is what tokens will carry, so trust the
  // document's value only when it is on the same host.
  const asked = new URL(base);
  const said = new URL(doc.issuer);
  const entra = asked.host === "login.microsoftonline.com";
  if (entra ? said.host !== asked.host : doc.issuer.replace(/\/+$/, "") !== base) {
    throw new Error("Discovery failed: the configuration names a different issuer.");
  }
  for (const k of ["authorization_endpoint", "token_endpoint", "userinfo_endpoint"] as const) {
    const v = doc[k];
    if (v && !/^https:\/\//i.test(v)) throw new Error(`Discovery failed: ${k} is not https.`);
  }
  return {
    issuer: doc.issuer,
    authorization_endpoint: doc.authorization_endpoint,
    token_endpoint: doc.token_endpoint,
    userinfo_endpoint: doc.userinfo_endpoint,
    token_endpoint_auth_methods_supported: doc.token_endpoint_auth_methods_supported,
    end_session_endpoint: doc.end_session_endpoint,
  };
}

/** Decode a compact JWS/JWT payload without verifying it. Throws on garbage. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  if (typeof token !== "string") throw new Error("No ID token.");
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) throw new Error("The ID token is not a compact JWT.");
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("The ID token payload is not JSON.");
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("The ID token payload is not an object.");
  return json as Record<string, unknown>;
}

export type IdTokenExpectations = {
  issuer: string;
  clientId: string;
  nonce: string;
  nowSec: number;
  /** Clock skew allowed, seconds. */
  skewSec?: number;
  /** Reject tokens issued longer ago than this, seconds. */
  maxAgeSec?: number;
};

export type IdTokenIdentity = {
  subject: string;
  email: string | null;
  emailVerified: boolean | null;
  givenName: string | null;
  familyName: string | null;
  name: string | null;
  hostedDomain: string | null;
};

export type IdTokenCheck = { ok: true; identity: IdTokenIdentity } | { ok: false; reason: string };

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function validateIdTokenClaims(claims: Record<string, unknown>, expect: IdTokenExpectations): IdTokenCheck {
  const skew = expect.skewSec ?? 120;
  const maxAge = expect.maxAgeSec ?? 600;

  if (claims.iss !== expect.issuer) return { ok: false, reason: "bad_issuer" };

  const aud = claims.aud;
  const auds = Array.isArray(aud) ? aud : [aud];
  if (!auds.includes(expect.clientId)) return { ok: false, reason: "bad_audience" };
  // Several audiences: the token must have been issued to us (azp), §3.1.3.7 (4)(5).
  if (auds.length > 1 && claims.azp !== expect.clientId) return { ok: false, reason: "bad_azp" };
  if (claims.azp !== undefined && claims.azp !== expect.clientId) return { ok: false, reason: "bad_azp" };

  if (typeof claims.exp !== "number") return { ok: false, reason: "no_exp" };
  if (claims.exp + skew <= expect.nowSec) return { ok: false, reason: "expired" };
  if (typeof claims.iat !== "number") return { ok: false, reason: "no_iat" };
  if (claims.iat - skew > expect.nowSec) return { ok: false, reason: "issued_in_future" };
  if (expect.nowSec - claims.iat > maxAge + skew) return { ok: false, reason: "too_old" };

  if (typeof claims.nonce !== "string" || claims.nonce !== expect.nonce) return { ok: false, reason: "bad_nonce" };

  const subject = str(claims.sub);
  if (!subject) return { ok: false, reason: "no_subject" };

  let emailVerified: boolean | null = null;
  if (claims.email_verified !== undefined) {
    // Some providers send "true"/"false" strings.
    emailVerified = claims.email_verified === true || claims.email_verified === "true";
    if (!emailVerified) return { ok: false, reason: "email_unverified" };
  }

  // Entra ID puts the sign-in name in preferred_username and sends `email`
  // only when the account has a mailbox; within one directory it is the
  // address the organisation assigned, so it is accepted as the email.
  const email = (str(claims.email) ?? (claims.iss && String(claims.iss).includes("login.microsoftonline.com") ? str(claims.preferred_username) : null))?.toLowerCase() ?? null;

  return {
    ok: true,
    identity: {
      subject,
      email,
      emailVerified,
      givenName: str(claims.given_name),
      familyName: str(claims.family_name),
      name: str(claims.name),
      hostedDomain: str(claims.hd),
    },
  };
}

/** Whether `email` is in one of the allowed domains (empty list = any). */
export function emailDomainAllowed(email: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return allowed.some((d) => d.trim().toLowerCase().replace(/^@/, "") === domain);
}
