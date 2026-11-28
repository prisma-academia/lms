import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { attemptDelivery } from "@/lib/integrations/webhook-delivery";

/**
 * Send the same event to the same endpoint again, now, as a new delivery (a
 * new X-Prisma-Delivery id; the event id is unchanged, so receivers that
 * dedupe on it still can).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_WRITE.key);
    const { id } = await ctx.params;
    const d = await prisma.webhookDelivery.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: { eventId: true, endpointId: true, endpoint: { select: { status: true } } },
    });
    if (!d) throw new DomainError(404, "not_found", "Delivery not found.");
    if (d.endpoint.status !== "ACTIVE") throw new DomainError(409, "endpoint_disabled", "Enable the endpoint before redelivering.");
    const fresh = await prisma.webhookDelivery.create({
      data: { tenantId: actor.tenantId, eventId: d.eventId, endpointId: d.endpointId },
    });
    const result = await attemptDelivery(fresh.id);
    return ok({ deliveryId: fresh.id, ok: result?.ok ?? false, status: result?.status ?? null, error: result?.error ?? null });
  } catch (e) {
    return handleError(e);
  }
}
