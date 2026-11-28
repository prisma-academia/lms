import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { resolveHost } from "@/lib/auth/context";
import { runWithContext } from "@/lib/db/tenant-context";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { findFeedToken, learnerFeed, staffFeed, touchFeedToken } from "@/lib/calendar/feeds";
import { logger } from "@/lib/logger";

/**
 * GET /api/calendar/<token>.ics — a private calendar subscription.
 *
 * No session (calendar servers fetch it), so the token is the credential:
 * it must be live, belong to the academy on this host, and its owner must
 * still be active (and, for staff, still allowed to see the calendar).
 * Anything wrong is a plain 404 — the URL either works or it does not.
 */

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "cache-control": "no-store" } });

export async function GET(request: Request, ctx: { params: Promise<{ feed: string }> }) {
  const host = resolveHost(request.headers.get("host"));
  if (host.mode !== "tenant") return notFound();
  try {
    const { feed } = await ctx.params;
    const raw = feed.endsWith(".ics") ? feed.slice(0, -4) : feed;
    const token = await findFeedToken(raw);
    if (!token) return notFound();
    const tenant = await prisma.tenant.findUnique({ where: { slug: host.slug }, select: { id: true, slug: true, name: true, status: true } });
    if (!tenant || tenant.id !== token.tenantId || tenant.status !== "ACTIVE") return notFound();

    const body = await runWithContext(
      { mode: token.ownerType === "TENANT" ? "tenant-admin" : "tenant-client", tenantId: tenant.id },
      async () => {
        if (token.ownerType === "CLIENT") {
          const client = await prisma.client.findFirst({ where: { id: token.ownerId, tenantId: tenant.id }, select: { status: true } });
          if (!client || client.status !== "ACTIVE") return null;
          return learnerFeed(tenant, token.ownerId);
        }
        const user = await prisma.tenantUser.findFirst({
          where: { id: token.ownerId, tenantId: tenant.id },
          select: { id: true, status: true, isOwner: true, permissions: true, tenantId: true },
        });
        if (!user || user.status !== "ACTIVE") return null;
        const actor = { kind: "tenant" as const, userId: user.id, tenantId: user.tenantId, isOwner: user.isOwner, permissions: new Set(user.permissions) };
        if (!hasPermission(actor, PERMISSIONS.TENANT_EVENTS_READ.key)) return null;
        return staffFeed(tenant);
      }
    );
    if (body === null) return notFound();
    await touchFeedToken(token.id).catch(() => undefined);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `inline; filename="${tenant.slug}.ics"`,
        "cache-control": "private, max-age=300",
        "x-robots-tag": "noindex",
      },
    });
  } catch (err) {
    logger.error({ err }, "calendar_feed_failed");
    return new NextResponse("Calendar temporarily unavailable", { status: 503 });
  }
}
