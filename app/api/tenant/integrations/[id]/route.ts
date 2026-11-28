import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { openSecrets, toView } from "@/lib/integrations/store";
import { SaveBody, saveIntegration } from "@/lib/integrations/manage";
import { providerInfo } from "@/lib/integrations/registry";
import { revokeGoogleToken } from "@/lib/integrations/google";
import { logger } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

async function load(tenantId: string, id: string) {
  const row = await prisma.tenantIntegration.findFirst({ where: { id, tenantId } });
  if (!row) throw new DomainError(404, "not_found", "Integration not found.");
  return row;
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_INTEGRATIONS_WRITE.key);
    const { id } = await ctx.params;
    const existing = await load(actor.tenantId, id);
    const raw = (await request.json()) as Record<string, unknown>;
    const body = SaveBody.parse({ ...raw, provider: existing.provider });
    const info = providerInfo(existing.provider);
    if (!info) throw new DomainError(400, "unknown_provider", "Unknown integration.");
    const row = await saveIntegration(actor.tenantId, actor.userId, info.id, body, existing);
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "integration.update",
      tenantId: actor.tenantId,
      targetType: "TenantIntegration",
      targetId: row.id,
      after: { provider: row.provider, name: row.name, status: row.status } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ integration: toView(row) });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_INTEGRATIONS_WRITE.key);
    const { id } = await ctx.params;
    const row = await load(actor.tenantId, id);

    // Google: revoke at Google too, so "disconnect" really ends our access.
    let revoked: boolean | null = null;
    if (row.provider === "google_calendar") {
      try {
        const token = openSecrets(row).refreshToken;
        revoked = token ? await revokeGoogleToken(token) : null;
      } catch (err) {
        logger.warn({ err, integrationId: row.id }, "google_revoke_failed");
        revoked = false;
      }
    }

    await prisma.tenantIntegration.delete({ where: { id: row.id } });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "integration.disconnect",
      tenantId: actor.tenantId,
      targetType: "TenantIntegration",
      targetId: row.id,
      before: { provider: row.provider, name: row.name } as object,
      after: revoked === null ? undefined : ({ revokedAtProvider: revoked } as object),
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ deleted: true, revoked });
  } catch (e) {
    return handleError(e);
  }
}
