import { prisma } from "@/lib/db/client";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { SAVED_TEMPLATE_TYPE } from "@/lib/site/saved-templates";

/**
 * Delete one of the academy's saved page designs.
 *
 * Only a saved SITE design: the `type` filter is what stops this route from
 * being a way to delete some other kind of template with the site permission.
 * Pages already made from the design are untouched — a design is copied into a
 * page, never linked to it.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_WRITE.key);
    const { id } = await ctx.params;

    const row = await prisma.template.findFirst({
      where: { id, tenantId: actor.tenantId, type: SAVED_TEMPLATE_TYPE },
      select: { id: true, name: true },
    });
    if (!row) throw new DomainError(404, "not_found", "That saved design no longer exists.");

    await prisma.template.delete({ where: { id: row.id } });

    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "site_template.delete",
      tenantId: actor.tenantId,
      targetType: "Template",
      targetId: row.id,
      before: { name: row.name } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
