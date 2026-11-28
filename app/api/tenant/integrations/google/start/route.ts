import { cookies } from "next/headers";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { prisma } from "@/lib/db/client";
import { isProd } from "@/lib/env";
import { derivedVerifier, integrationStateKey, randomToken, signState } from "@/lib/integrations/oauth";
import { googleAuthUrl, googleConfigured } from "@/lib/integrations/google";
import { requireEncryption } from "@/lib/integrations/manage";
import { GOOGLE_FLOW_COOKIE, GOOGLE_FLOW_COOKIE_PATH, GOOGLE_STATE_TTL_SEC } from "@/lib/integrations/google-flow";

/**
 * POST — begin connecting Google Calendar. Returns the consent-screen URL.
 *
 * The state is signed and names the academy, its host and the staff member;
 * the PKCE verifier is derived from the state's nonce with the server key, so
 * nothing is stored. A host-only cookie holding the nonce ties the flow to
 * this browser: the finishing step, back on this host, insists on it.
 */
export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_INTEGRATIONS_WRITE.key);
    if (!googleConfigured()) {
      throw new DomainError(503, "google_not_configured", "Google sign-in is not set up on this platform yet (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET).");
    }
    requireEncryption();
    const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: { slug: true } });
    if (!tenant) throw new DomainError(404, "not_found", "Academy not found.");
    const user = await prisma.tenantUser.findUnique({ where: { id: actor.userId }, select: { email: true } });

    const key = integrationStateKey();
    const nonce = randomToken();
    const state = signState(
      { t: actor.tenantId, s: tenant.slug, u: actor.userId, n: nonce, exp: Math.floor(Date.now() / 1000) + GOOGLE_STATE_TTL_SEC },
      key
    );
    const jar = await cookies();
    jar.set(GOOGLE_FLOW_COOKIE, nonce, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      path: GOOGLE_FLOW_COOKIE_PATH,
      maxAge: GOOGLE_STATE_TTL_SEC,
    });
    return ok({ url: googleAuthUrl({ state, verifier: derivedVerifier(nonce, key), loginHint: user?.email }) });
  } catch (e) {
    return handleError(e);
  }
}
