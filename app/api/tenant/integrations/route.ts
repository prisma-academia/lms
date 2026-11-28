import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { listIntegrations, toView } from "@/lib/integrations/store";
import { SaveBody, saveIntegration } from "@/lib/integrations/manage";
import { providerInfo } from "@/lib/integrations/registry";
import { prisma } from "@/lib/db/client";

/** GET: every connection, secrets masked. POST: connect a provider. */

export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_INTEGRATIONS_READ.key);
    return ok({ integrations: await listIntegrations(actor.tenantId) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_INTEGRATIONS_WRITE.key);
    const body = SaveBody.parse(await request.json());
    const info = providerInfo(body.provider);
    if (!info || info.kind !== "connection") throw new DomainError(400, "unknown_provider", "That integration cannot be connected this way.");
    if (!info.multiple) {
      const existing = await prisma.tenantIntegration.findFirst({ where: { tenantId: actor.tenantId, provider: info.id } });
      if (existing) throw new DomainError(409, "duplicate", `${info.name} is already connected. Edit it instead.`);
    }
    const row = await saveIntegration(actor.tenantId, actor.userId, info.id, body, null);
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "integration.connect",
      tenantId: actor.tenantId,
      targetType: "TenantIntegration",
      targetId: row.id,
      after: { provider: row.provider, name: row.name } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ integration: toView(row) }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
