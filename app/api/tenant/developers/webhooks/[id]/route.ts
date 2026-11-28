import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { endpointView } from "@/lib/developers/admin";
import { validateEndpointUrl, validateEvents } from "@/lib/integrations/endpoints";

const Patch = z
  .object({
    url: z.url().max(2000),
    events: z.array(z.string().min(1).max(60)).min(1).max(50),
    description: z.string().max(200).nullable(),
    status: z.enum(["ACTIVE", "DISABLED"]),
  })
  .partial();

/** Edit an endpoint; `status: "ACTIVE"` re-enables one (and forgets its failure run). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_WRITE.key);
    const { id } = await ctx.params;
    const body = Patch.parse(await request.json());
    const before = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!before) throw new DomainError(404, "not_found", "Webhook endpoint not found.");
    const data: Record<string, unknown> = {};
    if (body.url !== undefined) data.url = await validateEndpointUrl(body.url);
    if (body.events !== undefined) data.events = validateEvents(body.events);
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.status !== undefined && body.status !== before.status) {
      data.status = body.status;
      if (body.status === "ACTIVE") Object.assign(data, { disabledAt: null, disabledReason: null, consecutiveFailures: 0, failingSince: null });
      else Object.assign(data, { disabledAt: new Date(), disabledReason: "Disabled by staff." });
    }
    const endpoint = await prisma.webhookEndpoint.update({ where: { id }, data });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "webhook.update",
      tenantId: actor.tenantId,
      targetType: "WebhookEndpoint",
      targetId: id,
      before: { url: before.url, events: before.events, status: before.status },
      after: { url: endpoint.url, events: endpoint.events, status: endpoint.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ endpoint: endpointView(endpoint) });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_WRITE.key);
    const { id } = await ctx.params;
    const before = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId: actor.tenantId }, select: { id: true, url: true } });
    if (!before) throw new DomainError(404, "not_found", "Webhook endpoint not found.");
    await prisma.webhookEndpoint.delete({ where: { id } });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "webhook.delete",
      tenantId: actor.tenantId,
      targetType: "WebhookEndpoint",
      targetId: id,
      before: { url: before.url },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
