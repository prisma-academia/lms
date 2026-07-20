import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; grantId: string }> }
) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_ASSIGN.key);
    const { id, grantId } = await ctx.params;
    const meta = requestMeta(request);

    const grant = await prisma.libraryGrant.findFirst({
      where: { id: grantId, folderId: id, tenantId: actor.tenantId },
    });
    if (!grant) throw new DomainError(404, "not_found", "Assignment not found.");

    await prisma.libraryGrant.delete({ where: { id: grantId } });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "library.folder_revoke",
      tenantId: actor.tenantId,
      targetType: "LibraryFolder",
      targetId: id,
      before: { subjectType: grant.subjectType, subjectKey: grant.subjectKey } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ revoked: true });
  } catch (e) {
    return handleError(e);
  }
}
