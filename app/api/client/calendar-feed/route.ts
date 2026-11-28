import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { feedStatus, feedUrls, revokeFeed, rotateFeed } from "@/lib/calendar/feeds";

/**
 * The learner's own calendar subscription link.
 * GET: whether one is active. POST: create or replace it (the old link stops
 * working; the new one is returned once). DELETE: switch it off.
 */

export async function GET() {
  try {
    const actor = await requireClientActor();
    return ok({ feed: await feedStatus(actor.tenantId, { type: "CLIENT", id: actor.clientId }) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: { slug: true } });
    if (!tenant) throw new DomainError(404, "not_found", "Academy not found.");
    const token = await rotateFeed(actor.tenantId, { type: "CLIENT", id: actor.clientId });
    const meta = requestMeta(request);
    await audit({
      actorType: "CLIENT",
      actorId: actor.clientId,
      action: "calendar_feed.rotate",
      tenantId: actor.tenantId,
      targetType: "Client",
      targetId: actor.clientId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ urls: feedUrls(tenant.slug, token), feed: await feedStatus(actor.tenantId, { type: "CLIENT", id: actor.clientId }) });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    await revokeFeed(actor.tenantId, { type: "CLIENT", id: actor.clientId });
    const meta = requestMeta(request);
    await audit({
      actorType: "CLIENT",
      actorId: actor.clientId,
      action: "calendar_feed.revoke",
      tenantId: actor.tenantId,
      targetType: "Client",
      targetId: actor.clientId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ feed: await feedStatus(actor.tenantId, { type: "CLIENT", id: actor.clientId }) });
  } catch (e) {
    return handleError(e);
  }
}
