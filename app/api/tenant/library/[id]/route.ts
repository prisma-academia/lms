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
  title: z.string().max(300).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  folderId: z.string().min(1).nullable().optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
  isPublic: z.boolean().optional(),
  isFree: z.boolean().optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  durationSeconds: z.number().int().min(0).nullable().optional(),
  width: z.number().int().min(0).nullable().optional(),
  height: z.number().int().min(0).nullable().optional(),
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

    // A paid item needs a price, or it is unbuyable and effectively invisible.
    const nextIsFree = body.isFree ?? item.isFree;
    const nextPrice = body.priceCents !== undefined ? body.priceCents : item.priceCents;
    if (!nextIsFree && (nextPrice == null || nextPrice <= 0)) {
      throw new DomainError(400, "price_required", "A paid item needs a price above zero.");
    }

    const { tagIds, ...scalars } = body;
    await prisma.$transaction([
      prisma.libraryItem.update({
        where: { id },
        data: {
          ...scalars,
          // Free items must not keep a stale price hanging around.
          ...(nextIsFree ? { priceCents: null } : {}),
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
