import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { recordStorageDelta } from "@/lib/storage/quota";

const PatchBody = z.object({
  name: z.string().min(1).max(300).optional(),
  groupId: z.string().min(1).nullable().optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_RESOURCES_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());

    const resource = await prisma.resource.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!resource) throw new DomainError(404, "not_found", "Resource not found.");

    if (body.groupId) {
      const group = await prisma.resourceGroup.findFirst({ where: { id: body.groupId, tenantId: actor.tenantId } });
      if (!group) throw new DomainError(400, "invalid_group", "Resource group not found.");
    }
    if (body.tagIds && body.tagIds.length > 0) {
      const found = await prisma.resourceTag.findMany({ where: { id: { in: body.tagIds } }, select: { id: true } });
      if (found.length !== new Set(body.tagIds).size) {
        throw new DomainError(400, "invalid_tags", "One or more tags do not belong to this tenant.");
      }
    }

    await prisma.$transaction([
      prisma.resource.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.groupId !== undefined ? { groupId: body.groupId } : {}),
        },
      }),
      ...(body.tagIds !== undefined
        ? [
            prisma.resourceTagLink.deleteMany({ where: { resourceId: id } }),
            ...(body.tagIds.length > 0
              ? [
                  prisma.resourceTagLink.createMany({
                    data: [...new Set(body.tagIds)].map((tagId) => ({ tenantId: actor.tenantId, resourceId: id, tagId })),
                  }),
                ]
              : []),
          ]
        : []),
    ]);

    return ok({ updated: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_RESOURCES_WRITE.key);
    const { id } = await ctx.params;
    const resource = await prisma.resource.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!resource) throw new DomainError(404, "not_found", "Resource not found.");
    await prisma.resource.delete({ where: { id } });
    // Free the quota accounting (the object itself is reclaimed by the reconcile job).
    await recordStorageDelta(actor.tenantId, -resource.sizeBytes);
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
