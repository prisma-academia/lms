import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { abortMultipartUpload } from "@/lib/storage/s3";
import { releaseStorageReservation } from "@/lib/storage/quota";

/** Resume state: which parts already landed, so the client only re-sends the rest. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_WRITE.key);
    const { id } = await ctx.params;
    const session = await prisma.libraryUpload.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { parts: { select: { partNumber: true, etag: true, sizeBytes: true } } },
    });
    if (!session) throw new DomainError(404, "not_found", "Upload session not found.");

    return ok({
      session: {
        id: session.id,
        status: session.status,
        key: session.key,
        contentType: session.contentType,
        originalFilename: session.originalFilename,
        declaredBytes: Number(session.declaredBytes),
        uploadedBytes: Number(session.uploadedBytes),
        partSizeBytes: session.partSizeBytes,
        totalParts: session.totalParts,
        folderId: session.folderId,
        title: session.title,
        description: session.description,
        expiresAt: session.expiresAt.toISOString(),
        parts: session.parts,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_WRITE.key);
    const { id } = await ctx.params;
    const session = await prisma.libraryUpload.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!session) throw new DomainError(404, "not_found", "Upload session not found.");

    // Aborting an already-finished session must not double-release the quota.
    if (session.status !== "PENDING") return ok({ aborted: true });

    try {
      await abortMultipartUpload({ key: session.key, uploadId: session.uploadId });
    } catch {
      // Already aborted upstream — still mark it locally so quota is freed.
    }
    await prisma.libraryUpload.update({ where: { id }, data: { status: "ABORTED" } });

    // Release the full declared size: that is what was reserved, and none of it
    // ever reached storageUsedBytes (incomplete multipart parts are invisible
    // to ListObjectsV2).
    await releaseStorageReservation(actor.tenantId, session.declaredBytes);

    return ok({ aborted: true });
  } catch (e) {
    return handleError(e);
  }
}
