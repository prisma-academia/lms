import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import {
  createMultipartUpload,
  isAllowedUploadType,
  libraryKeyFor,
  partSizeFor,
  s3Configured,
  MAX_ASSET_BYTES,
} from "@/lib/storage/s3";
import { assertStorageQuota, reserveStorage } from "@/lib/storage/quota";
import { mediaKindForContentType } from "@/lib/media/kind";

/** How long a half-finished upload may sit before the reconcile job reclaims it. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const CreateBody = z.object({
  filename: z.string().min(1).max(300),
  contentType: z.string().min(1).max(200),
  totalBytes: z.number().int().positive(),
  folderId: z.string().min(1).nullable().optional(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
});

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_WRITE.key);
    const body = CreateBody.parse(await request.json());

    if (!s3Configured()) {
      throw new DomainError(503, "storage_unconfigured", "Object storage is not configured.");
    }
    if (!isAllowedUploadType(body.contentType, "library")) {
      throw new DomainError(400, "bad_type", "Unsupported file type.");
    }
    if (body.totalBytes > MAX_ASSET_BYTES.library) {
      throw new DomainError(
        400,
        "file_too_large",
        `Files must be ${Math.floor(MAX_ASSET_BYTES.library / 1024 ** 3)} GB or smaller.`
      );
    }
    if (body.folderId) {
      const folder = await prisma.libraryFolder.findFirst({
        where: { id: body.folderId, tenantId: actor.tenantId },
      });
      if (!folder) throw new DomainError(400, "invalid_folder", "Library folder not found.");
    }

    // Reserve before creating the S3 upload: if the reservation fails on quota
    // we never leave an orphaned multipart upload behind.
    await assertStorageQuota(actor.tenantId, body.totalBytes);

    const key = libraryKeyFor(actor.tenantId, body.contentType);
    const partSizeBytes = partSizeFor(body.totalBytes);
    const totalParts = Math.max(1, Math.ceil(body.totalBytes / partSizeBytes));

    const { uploadId } = await createMultipartUpload({ key, contentType: body.contentType });

    let session;
    try {
      session = await prisma.libraryUpload.create({
        data: {
          tenantId: actor.tenantId,
          uploadId,
          key,
          contentType: body.contentType,
          mediaKind: mediaKindForContentType(body.contentType),
          originalFilename: body.filename,
          declaredBytes: BigInt(body.totalBytes),
          partSizeBytes,
          totalParts,
          title: body.title ?? null,
          description: body.description ?? null,
          folderId: body.folderId ?? null,
          createdById: actor.userId,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      });
    } catch (e) {
      // Don't strand a multipart upload S3 is now holding open.
      const { abortMultipartUpload } = await import("@/lib/storage/s3");
      await abortMultipartUpload({ key, uploadId }).catch(() => {});
      throw e;
    }

    await reserveStorage(actor.tenantId, BigInt(body.totalBytes));

    return ok(
      {
        session: {
          id: session.id,
          key: session.key,
          partSizeBytes,
          totalParts,
          expiresAt: session.expiresAt.toISOString(),
        },
      },
      undefined,
      201
    );
  } catch (e) {
    return handleError(e);
  }
}

/** Live sessions, so the client can reconcile its local queue after a reload. */
export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_WRITE.key);
    const sessions = await prisma.libraryUpload.findMany({
      where: { tenantId: actor.tenantId, status: "PENDING", createdById: actor.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { parts: { select: { partNumber: true, etag: true, sizeBytes: true } } },
    });
    return ok(
      sessions.map((s) => ({
        id: s.id,
        key: s.key,
        contentType: s.contentType,
        originalFilename: s.originalFilename,
        declaredBytes: Number(s.declaredBytes),
        uploadedBytes: Number(s.uploadedBytes),
        partSizeBytes: s.partSizeBytes,
        totalParts: s.totalParts,
        folderId: s.folderId,
        title: s.title,
        description: s.description,
        expiresAt: s.expiresAt.toISOString(),
        parts: s.parts,
      }))
    );
  } catch (e) {
    return handleError(e);
  }
}
