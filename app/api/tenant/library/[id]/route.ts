import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { recordStorageDelta } from "@/lib/storage/quota";
import { deleteObject } from "@/lib/storage/s3";
import { logger } from "@/lib/logger";

const PatchBody = z.object({
  name: z.string().min(1).max(300).optional(),
  folderId: z.string().min(1).nullable().optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());

    const item = await prisma.libraryItem.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!item) throw new DomainError(404, "not_found", "Library item not found.");

    if (body.folderId) {
      const folder = await prisma.libraryFolder.findFirst({ where: { id: body.folderId, tenantId: actor.tenantId } });
      if (!folder) throw new DomainError(400, "invalid_folder", "Library folder not found.");
    }
    if (body.tagIds && body.tagIds.length > 0) {
      const found = await prisma.libraryTag.findMany({ where: { id: { in: body.tagIds } }, select: { id: true } });
      if (found.length !== new Set(body.tagIds).size) {
        throw new DomainError(400, "invalid_tags", "One or more tags do not belong to this tenant.");
      }
    }

    await prisma.$transaction([
      prisma.libraryItem.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
        },
      }),
      ...(body.tagIds !== undefined
        ? [
            prisma.libraryItemTag.deleteMany({ where: { itemId: id } }),
            ...(body.tagIds.length > 0
              ? [
                  prisma.libraryItemTag.createMany({
                    data: [...new Set(body.tagIds)].map((tagId) => ({ tenantId: actor.tenantId, itemId: id, tagId })),
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
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_WRITE.key);
    const { id } = await ctx.params;
    const item = await prisma.libraryItem.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!item) throw new DomainError(404, "not_found", "Library item not found.");
    await prisma.libraryItem.delete({ where: { id } });

    // Delete the object itself, not just the row. Previously only the counter
    // was decremented, so the next reconcile pass — which sums what is actually
    // in the bucket — silently re-inflated storageUsedBytes and the bytes were
    // never reclaimed.
    await deleteObject(item.key).catch((e) => {
      logger.warn({ err: e, key: item.key }, "library: object delete failed; reconcile will retry");
    });
    if (item.posterKey) {
      await deleteObject(item.posterKey).catch(() => {});
    }
    await recordStorageDelta(actor.tenantId, -item.sizeBytes);
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
