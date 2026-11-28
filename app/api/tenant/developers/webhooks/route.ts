import { z } from "zod";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { endpointView, listEndpoints } from "@/lib/developers/admin";
import { createEndpoint } from "@/lib/integrations/endpoints";

const Body = z.object({
  url: z.url().max(2000),
  events: z.array(z.string().min(1).max(60)).min(1).max(50),
  description: z.string().max(200).nullable().optional(),
});

export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_READ.key);
    return ok({ endpoints: await listEndpoints(actor.tenantId) });
  } catch (e) {
    return handleError(e);
  }
}

/** Add an endpoint. The signing secret is in this response only. */
export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_WRITE.key);
    const body = Body.parse(await request.json());
    const { endpoint, secret } = await createEndpoint({
      tenantId: actor.tenantId,
      url: body.url,
      events: body.events,
      description: body.description ?? null,
      source: "portal",
      createdById: actor.userId,
    });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "webhook.create",
      tenantId: actor.tenantId,
      targetType: "WebhookEndpoint",
      targetId: endpoint.id,
      after: { url: endpoint.url, events: endpoint.events },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ endpoint: endpointView(endpoint), secret }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
