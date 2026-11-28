import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { feedStatus, feedUrls, revokeFeed, rotateFeed } from "@/lib/calendar/feeds";

/**
 * A staff member's own calendar subscription link (every academy event and
 * published exam). Needs calendar read access; the feed re-checks it on every
 * fetch. GET status / POST create-or-replace (shown once) / DELETE revoke.
 */

const READ = PERMISSIONS.TENANT_EVENTS_READ.key;

export async function GET() {
  try {
    const actor = await requireTenantActor(READ);
    return ok({ feed: await feedStatus(actor.tenantId, { type: "TENANT", id: actor.userId }) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(READ);
    const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: { slug: true } });
    if (!tenant) throw new DomainError(404, "not_found", "Academy not found.");
    const token = await rotateFeed(actor.tenantId, { type: "TENANT", id: actor.userId });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "calendar_feed.rotate",
      tenantId: actor.tenantId,
      targetType: "TenantUser",
      targetId: actor.userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ urls: feedUrls(tenant.slug, token), feed: await feedStatus(actor.tenantId, { type: "TENANT", id: actor.userId }) });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(READ);
    await revokeFeed(actor.tenantId, { type: "TENANT", id: actor.userId });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "calendar_feed.revoke",
      tenantId: actor.tenantId,
      targetType: "TenantUser",
      targetId: actor.userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ feed: await feedStatus(actor.tenantId, { type: "TENANT", id: actor.userId }) });
  } catch (e) {
    return handleError(e);
  }
}
