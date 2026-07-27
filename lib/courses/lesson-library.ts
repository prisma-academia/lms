import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";

/** Resolve libraryItemId → assetKey for FILE lessons; clears when null. */
export async function resolveLessonLibraryRef(input: {
  tenantId: string;
  contentType: string;
  libraryItemId: string | null | undefined;
  assetKey?: string | null;
}): Promise<{ libraryItemId: string | null; assetKey: string | null }> {
  if (input.contentType !== "FILE") {
    return { libraryItemId: null, assetKey: input.assetKey ?? null };
  }

  if (input.libraryItemId === null) {
    return { libraryItemId: null, assetKey: null };
  }

  if (input.libraryItemId) {
    const item = await prisma.libraryItem.findFirst({
      where: { id: input.libraryItemId, tenantId: input.tenantId },
      select: { id: true, key: true },
    });
    if (!item) {
      throw new DomainError(400, "invalid_library_item", "Library item not found.");
    }
    return { libraryItemId: item.id, assetKey: item.key };
  }

  // Legacy: only assetKey provided — try to link by key.
  if (input.assetKey) {
    const item = await prisma.libraryItem.findFirst({
      where: { tenantId: input.tenantId, key: input.assetKey },
      select: { id: true, key: true },
    });
    if (item) return { libraryItemId: item.id, assetKey: item.key };
    return { libraryItemId: null, assetKey: input.assetKey };
  }

  return { libraryItemId: null, assetKey: null };
}
