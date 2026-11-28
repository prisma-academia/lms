import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { endpointView } from "@/lib/developers/admin";
import { rotateEndpointSecret } from "@/lib/integrations/endpoints";

/** New signing secret, shown once. Deliveries carry both signatures for 24 hours. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_WRITE.key);
    const { id } = await ctx.params;
    const { endpoint, secret } = await rotateEndpointSecret(actor.tenantId, id);
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "webhook.rotate_secret",
      tenantId: actor.tenantId,
      targetType: "WebhookEndpoint",
      targetId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ endpoint: endpointView(endpoint), secret });
  } catch (e) {
    return handleError(e);
  }
}
