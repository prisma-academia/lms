import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { audit } from "@/lib/auth/audit";
import { ListQuery, WebhookSubscribe } from "@/lib/api/v1/schemas";
import { page, pageArgs } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";
import { createEndpoint } from "@/lib/integrations/endpoints";

/** GET /api/v1/webhooks — every webhook endpoint of this academy. */
export const GET = apiRoute({ scope: "webhooks:manage" }, async (ctx) => {
  const q = ctx.query(ListQuery);
  const rows = await prisma.webhookEndpoint.findMany({ where: { tenantId: ctx.tenantId }, ...pageArgs(q, "createdAt") });
  return page(rows, q, out.webhookSubscription);
});

/**
 * POST /api/v1/webhooks — REST-hook subscribe (Zapier, Make, n8n). Returns
 * the subscription id (for DELETE on unsubscribe) and its signing secret, once.
 */
export const POST = apiRoute({ scope: "webhooks:manage" }, async (ctx) => {
  const body = ctx.json(WebhookSubscribe);
  const { endpoint, secret } = await createEndpoint({
    tenantId: ctx.tenantId,
    url: body.url,
    events: body.events,
    description: body.description ?? `REST hook (${ctx.key.name})`,
    source: "rest_hook",
    apiKeyId: ctx.key.keyId,
  });
  await audit({ ...ctx.auditActor, action: "webhook.subscribe", targetType: "WebhookEndpoint", targetId: endpoint.id, after: { url: endpoint.url, events: endpoint.events } });
  return { data: { ...out.webhookSubscription(endpoint), secret }, status: 201 };
});
