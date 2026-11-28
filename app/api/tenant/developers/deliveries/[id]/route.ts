import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { eventBody } from "@/lib/integrations/webhook-delivery";

/** One delivery: the request we sent (headers, body) and what came back. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_READ.key);
    const { id } = await ctx.params;
    const d = await prisma.webhookDelivery.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { event: true, endpoint: { select: { url: true } } },
    });
    if (!d) throw new DomainError(404, "not_found", "Delivery not found.");
    return ok({
      id: d.id,
      status: d.status,
      attempt: d.attempt,
      url: d.endpoint.url,
      eventType: d.event.type,
      requestHeaders: d.requestHeadersJson ?? null,
      requestBody: eventBody(d.event),
      responseStatus: d.responseStatus,
      responseBody: d.responseBody,
      errorMessage: d.errorMessage,
      durationMs: d.durationMs,
      nextAttemptAt: d.nextAttemptAt?.toISOString() ?? null,
      lastAttemptAt: d.lastAttemptAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    });
  } catch (e) {
    return handleError(e);
  }
}
