import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { resolveHost } from "@/lib/auth/context";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { tenantHttpOrigin } from "@/lib/url/tenant";
import { logger } from "@/lib/logger";
import { derivedVerifier, integrationStateKey, safeEqual } from "@/lib/integrations/oauth";
import { exchangeGoogleCode, revokeGoogleToken } from "@/lib/integrations/google";
import { GOOGLE_FLOW_COOKIE, GOOGLE_FLOW_COOKIE_PATH, readGoogleState } from "@/lib/integrations/google-flow";
import { configOf, openSecrets, sealSecrets } from "@/lib/integrations/store";
import { enforceSingleMeetingProvider } from "@/lib/integrations/manage";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * GET — the second half of the Google connect flow, on the academy's host.
 * Requires: a valid signed state for THIS academy, the flow cookie this
 * browser got at the start, and the same signed-in staff member. Then the code
 * is exchanged (with the derived PKCE verifier) and the refresh token sealed.
 */
export async function GET(request: Request) {
  const host = resolveHost(request.headers.get("host"));
  if (host.mode !== "tenant") return new NextResponse("Not found", { status: 404 });
  const origin = tenantHttpOrigin(host.slug);
  const back = (outcome: string) => {
    const res = NextResponse.redirect(`${origin}/admin/integrations?google=${outcome}`, 303);
    res.cookies.set(GOOGLE_FLOW_COOKIE, "", { path: GOOGLE_FLOW_COOKIE_PATH, maxAge: 0 });
    return res;
  };

  const url = new URL(request.url);
  const state = readGoogleState(url.searchParams.get("state"));
  if (!state || state.s !== host.slug) return back("expired");

  const jar = await cookies();
  const nonce = jar.get(GOOGLE_FLOW_COOKIE)?.value ?? "";
  if (!nonce || !safeEqual(nonce, state.n)) return back("browser_mismatch");

  let actor;
  try {
    actor = await requireTenantActor(PERMISSIONS.TENANT_INTEGRATIONS_WRITE.key);
  } catch {
    return NextResponse.redirect(`${origin}/admin/auth/login`, 303);
  }
  if (actor.tenantId !== state.t || actor.userId !== state.u) return back("wrong_user");

  const code = url.searchParams.get("code");
  if (!code) return back(url.searchParams.get("error") === "access_denied" ? "denied" : "failed");

  try {
    const tokens = await exchangeGoogleCode(code, derivedVerifier(state.n, integrationStateKey()));
    const existing = await prisma.tenantIntegration.findFirst({ where: { tenantId: actor.tenantId, provider: "google_calendar", name: "" } });
    const prevConfig = existing ? configOf(existing) : {};
    let oldToken: string | undefined;
    if (existing) {
      try {
        oldToken = openSecrets(existing).refreshToken;
      } catch {
        oldToken = undefined;
      }
    }
    const config = { ...prevConfig, email: tokens.email, scope: tokens.scope, autoCreate: prevConfig.autoCreate === true };
    const data = {
      configJson: config as Prisma.InputJsonValue,
      secretsEnc: sealSecrets(actor.tenantId, "google_calendar", { refreshToken: tokens.refreshToken }),
      status: "CONNECTED" as const,
      lastSyncAt: new Date(),
      lastError: null,
      lastErrorAt: null,
      connectedById: actor.userId,
    };
    const row = existing
      ? await prisma.tenantIntegration.update({ where: { id: existing.id }, data })
      : await prisma.tenantIntegration.create({ data: { ...data, tenantId: actor.tenantId, provider: "google_calendar", name: "" } });
    if (oldToken && oldToken !== tokens.refreshToken) await revokeGoogleToken(oldToken);
    if (config.autoCreate) await enforceSingleMeetingProvider(actor.tenantId, row.id);

    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "integration.connect",
      tenantId: actor.tenantId,
      targetType: "TenantIntegration",
      targetId: row.id,
      after: { provider: "google_calendar", account: tokens.email } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return back("connected");
  } catch (err) {
    logger.warn({ err, tenantId: actor.tenantId }, "google_connect_failed");
    return back("failed");
  }
}
