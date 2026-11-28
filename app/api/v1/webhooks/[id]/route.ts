import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { audit } from "@/lib/auth/audit";
import { DomainError } from "@/lib/api/errors";

/** DELETE /api/v1/webhooks/{id} — REST-hook unsubscribe. Pending deliveries are discarded. */
export const DELETE = apiRoute<{ id: string }>({ scope: "webhooks:manage" }, async (ctx) => {
  const ep = await prisma.webhookEndpoint.findFirst({ where: { id: ctx.params.id, tenantId: ctx.tenantId }, select: { id: true, url: true } });
  if (!ep) throw new DomainError(404, "not_found", "Webhook subscription not found.");
  await prisma.webhookEndpoint.delete({ where: { id: ep.id } });
  await audit({ ...ctx.auditActor, action: "webhook.unsubscribe", targetType: "WebhookEndpoint", targetId: ep.id, before: { url: ep.url } });
  return { data: { id: ep.id, deleted: true } };
});
