import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { rawPrisma } from "@/lib/db/raw-client";
import { resolveHost } from "@/lib/auth/context";
import { createSession } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { consumeLoginLink } from "@/lib/auth/login-link";
import { clientIpOf } from "@/lib/api/v1/keys";
import { runWithContext } from "@/lib/db/tenant-context";
import { tenantHttpOrigin } from "@/lib/url/tenant";
import { logger } from "@/lib/logger";

/**
 * GET /api/auth/login-link?token=… — redeem a one-time learner sign-in link
 * (minted by POST /v1/learners/{id}/login-link) on the academy's own host,
 * start a learner session, and land on the link's path (default /dashboard).
 * Any failure lands on the sign-in page with a reason, never an error page.
 */
export async function GET(request: Request) {
  const host = resolveHost(request.headers.get("host"));
  if (host.mode !== "tenant") return new NextResponse("Not found", { status: 404 });
  const origin = tenantHttpOrigin(host.slug);
  const toLogin = (reason: string) => NextResponse.redirect(`${origin}/auth/login?link=${reason}`, 303);

  try {
    const tenant = await rawPrisma.tenant.findUnique({ where: { slug: host.slug }, select: { id: true, status: true } });
    if (!tenant || tenant.status !== "ACTIVE") return toLogin("unavailable");

    const token = new URL(request.url).searchParams.get("token") ?? "";
    const ip = clientIpOf(request.headers);
    const result = await consumeLoginLink(token, tenant.id, ip);
    if (!result.ok) return toLogin(result.reason === "wrong_host" ? "invalid" : result.reason);

    return await runWithContext({ mode: "tenant-client", tenantId: tenant.id }, async () => {
      const client = await prisma.client.findFirst({ where: { id: result.clientId, tenantId: tenant.id } });
      if (!client || client.status !== "ACTIVE") return toLogin("unavailable");
      await prisma.client.update({ where: { id: client.id }, data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } });
      await createSession({
        userId: client.id,
        userType: "CLIENT",
        tenantId: tenant.id,
        scope: client.mustChangePassword ? "MUST_CHANGE_PASSWORD" : "FULL",
        ip,
        userAgent: request.headers.get("user-agent"),
      });
      await audit({
        actorType: "CLIENT",
        actorId: client.id,
        action: "auth.client_login_link",
        tenantId: tenant.id,
        targetType: "Client",
        targetId: client.id,
        ip,
        userAgent: request.headers.get("user-agent"),
      });
      const next = client.mustChangePassword ? "/auth/change-password" : (result.redirectPath ?? "/dashboard");
      return NextResponse.redirect(`${origin}${next}`, 303);
    });
  } catch (err) {
    logger.error({ err }, "login_link_consume_failed");
    return toLogin("error");
  }
}
