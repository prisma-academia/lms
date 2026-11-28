import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { resolveHost } from "@/lib/auth/context";
import { runWithContext } from "@/lib/db/tenant-context";
import { safeNextPath } from "@/lib/auth/next-path";
import { isProd } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isSsoProvider } from "@/lib/integrations/registry";
import { FLOW_COOKIE_MAX_AGE, SSO_COOKIE, SSO_COOKIE_PATH, audienceAllowed, ssoSettings, startSso, type SsoAudience } from "@/lib/integrations/sso";
import { ssoLoginPath } from "@/lib/integrations/sso-urls";
import { tenantHttpOrigin } from "@/lib/url/tenant";

/**
 * GET /api/sso/<integrationId>/start?audience=learner|staff[&next=/path]
 * Sends the browser to the academy's identity provider. The connection must
 * belong to the academy whose host this is, be switched on, and allow the
 * audience asked for.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const host = resolveHost(request.headers.get("host"));
  if (host.mode !== "tenant") return new NextResponse("Not found", { status: 404 });
  const origin = tenantHttpOrigin(host.slug);
  const url = new URL(request.url);
  const audience: SsoAudience = url.searchParams.get("audience") === "staff" ? "staff" : "learner";
  const fail = (reason: string) => NextResponse.redirect(`${origin}${ssoLoginPath(audience, reason)}`, 303);

  try {
    const { id } = await ctx.params;
    const tenant = await prisma.tenant.findUnique({ where: { slug: host.slug }, select: { id: true, slug: true, status: true } });
    if (!tenant || tenant.status !== "ACTIVE") return fail("unavailable");

    return await runWithContext({ mode: "tenant-admin", tenantId: tenant.id }, async () => {
      const row = await prisma.tenantIntegration.findFirst({ where: { id, tenantId: tenant.id } });
      if (!row || !isSsoProvider(row.provider) || row.status === "DISABLED") return fail("unavailable");
      if (!audienceAllowed(ssoSettings(row), audience)) return fail("unavailable");

      const next = audience === "learner" ? safeNextPath(url.searchParams.get("next")) : null;
      const { location, cookie } = await startSso(row, tenant, audience, next);
      const jar = await cookies();
      jar.set(SSO_COOKIE, cookie, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        path: SSO_COOKIE_PATH,
        maxAge: FLOW_COOKIE_MAX_AGE,
      });
      return NextResponse.redirect(location, 303);
    });
  } catch (err) {
    logger.warn({ err }, "sso_start_failed");
    return fail("provider_unreachable");
  }
}
