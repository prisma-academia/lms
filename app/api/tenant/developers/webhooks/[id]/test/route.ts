import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { attemptDelivery } from "@/lib/integrations/webhook-delivery";
import { TEST_EVENT_TYPE } from "@/lib/integrations/webhook-catalogue";

/**
 * "Send test event": a signed `ping` to this endpoint only, sent now, with the
 * result in the response. It is a real delivery (logged, redeliverable).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_WRITE.key);
    const { id } = await ctx.params;
    const ep = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId: actor.tenantId }, select: { id: true, status: true } });
    if (!ep) throw new DomainError(404, "not_found", "Webhook endpoint not found.");
    if (ep.status !== "ACTIVE") throw new DomainError(409, "endpoint_disabled", "Enable the endpoint before testing it.");
    const event = await prisma.webhookEvent.create({
      data: { tenantId: actor.tenantId, type: TEST_EVENT_TYPE, payloadJson: { message: "This is a test event from the developer portal.", sentBy: actor.userId } },
    });
    const delivery = await prisma.webhookDelivery.create({
      data: { tenantId: actor.tenantId, eventId: event.id, endpointId: ep.id },
    });
    const result = await attemptDelivery(delivery.id);
    return ok({
      deliveryId: delivery.id,
      ok: result?.ok ?? false,
      status: result?.status ?? null,
      durationMs: result?.durationMs ?? null,
      error: result?.error ?? (result ? null : "The delivery could not be attempted."),
      responseBody: result?.responseBody ?? null,
    });
  } catch (e) {
    return handleError(e);
  }
}
