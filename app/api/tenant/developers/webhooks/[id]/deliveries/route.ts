import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";

/** The endpoint's delivery log, newest first, 50 per page (`?cursor=`). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_READ.key);
    const { id } = await ctx.params;
    const ep = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId: actor.tenantId }, select: { id: true } });
    if (!ep) throw new DomainError(404, "not_found", "Webhook endpoint not found.");
    const cursor = new URL(request.url).searchParams.get("cursor");
    const rows = await prisma.webhookDelivery.findMany({
      where: { tenantId: actor.tenantId, endpointId: ep.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        status: true,
        attempt: true,
        responseStatus: true,
        durationMs: true,
        errorMessage: true,
        nextAttemptAt: true,
        lastAttemptAt: true,
        createdAt: true,
        event: { select: { id: true, type: true } },
      },
    });
    const more = rows.length > 50;
    const page = more ? rows.slice(0, 50) : rows;
    return ok(
      page.map((d) => ({
        id: d.id,
        status: d.status,
        attempt: d.attempt,
        responseStatus: d.responseStatus,
        durationMs: d.durationMs,
        errorMessage: d.errorMessage,
        nextAttemptAt: d.nextAttemptAt?.toISOString() ?? null,
        lastAttemptAt: d.lastAttemptAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
        eventId: d.event.id,
        eventType: d.event.type,
      })),
      { nextCursor: more ? (page[page.length - 1]?.id ?? null) : null }
    );
  } catch (e) {
    return handleError(e);
  }
}
