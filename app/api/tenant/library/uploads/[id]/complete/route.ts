import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { completeMultipartUpload, headObjectSize, deleteObject } from "@/lib/storage/s3";
import {
  settleStorageReservation,
  releaseStorageReservation,
  getTenantStorage,
} from "@/lib/storage/quota";

const Body = z.object({
  name: z.string().min(1).max(300).optional(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  folderId: z.string().min(1).nullable().optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
  checksumSha256: z.string().max(128).optional(),
  durationSeconds: z.number().int().min(0).max(24 * 3600).optional(),
  width: z.number().int().min(0).max(100_000).optional(),
  height: z.number().int().min(0).max(100_000).optional(),
  isPublic: z.boolean().optional(),
  isFree: z.boolean().optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_WRITE.key);
    const { id } = await ctx.params;
    const body = Body.parse(await request.json());
    const meta = requestMeta(request);

    const session = await prisma.libraryUpload.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { parts: { orderBy: { partNumber: "asc" } } },
    });
    if (!session) throw new DomainError(404, "not_found", "Upload session not found.");

    // Completing twice must return the existing item, not create a second one.
    if (session.status === "COMPLETED" && session.itemId) {
      const existing = await prisma.libraryItem.findFirst({
        where: { id: session.itemId, tenantId: actor.tenantId },
      });
      if (existing) return ok({ item: { ...existing, sizeBytes: Number(existing.sizeBytes) } });
    }
    if (session.status !== "PENDING") {
      throw new DomainError(409, "session_closed", "This upload is no longer active.");
    }
    if (session.parts.length === 0) {
      throw new DomainError(400, "no_parts", "No parts were uploaded.");
    }
    if (session.parts.length !== session.totalParts) {
      throw new DomainError(
        400,
        "incomplete",
        `Upload is incomplete (${session.parts.length} of ${session.totalParts} parts).`
      );
    }

    const folderId = body.folderId !== undefined ? body.folderId : session.folderId;
    if (folderId) {
      const folder = await prisma.libraryFolder.findFirst({
        where: { id: folderId, tenantId: actor.tenantId },
      });
      if (!folder) throw new DomainError(400, "invalid_folder", "Library folder not found.");
    }
    if (body.tagIds && body.tagIds.length > 0) {
      const found = await prisma.libraryTag.findMany({
        where: { id: { in: body.tagIds } },
        select: { id: true },
      });
      if (found.length !== new Set(body.tagIds).size) {
        throw new DomainError(400, "invalid_tags", "One or more tags do not belong to this tenant.");
      }
    }

    await completeMultipartUpload({
      key: session.key,
      uploadId: session.uploadId,
      parts: session.parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
    });

    // Authoritative size. A client can under-declare totalBytes to slip past the
    // quota check at create time, so the real size is measured here and the
    // object is discarded if it does not fit.
    const actualBytes = await headObjectSize(session.key);
    const { storageUsedBytes, storageQuotaBytes, storageReservedBytes } = await getTenantStorage(
      actor.tenantId
    );
    const committedWithoutThis = storageUsedBytes + storageReservedBytes - session.declaredBytes;
    if (committedWithoutThis + BigInt(actualBytes) > storageQuotaBytes) {
      await deleteObject(session.key).catch(() => {});
      await prisma.libraryUpload.update({ where: { id: session.id }, data: { status: "ABORTED" } });
      await releaseStorageReservation(actor.tenantId, session.declaredBytes);
      throw new DomainError(
        413,
        "quota_exceeded",
        "The uploaded file is larger than declared and does not fit in your remaining storage."
      );
    }

    const item = await prisma.libraryItem.create({
      data: {
        tenantId: actor.tenantId,
        name: body.name ?? session.originalFilename,
        key: session.key,
        contentType: session.contentType,
        sizeBytes: BigInt(actualBytes),
        mediaKind: session.mediaKind,
        originalFilename: session.originalFilename,
        folderId: folderId ?? null,
        createdById: actor.userId,
        title: body.title ?? session.title,
        description: body.description ?? session.description,
        checksumSha256: body.checksumSha256 ?? null,
        durationSeconds: body.durationSeconds ?? null,
        width: body.width ?? null,
        height: body.height ?? null,
        isPublic: body.isPublic ?? false,
        isFree: body.isFree ?? true,
        priceCents: body.priceCents ?? null,
        currency: body.currency ?? null,
        tags: body.tagIds
          ? { create: [...new Set(body.tagIds)].map((tagId) => ({ tenantId: actor.tenantId, tagId })) }
          : undefined,
      },
      include: {
        folder: { select: { name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
      },
    });

    await prisma.libraryUpload.update({
      where: { id: session.id },
      data: { status: "COMPLETED", itemId: item.id, uploadedBytes: BigInt(actualBytes) },
    });
    await settleStorageReservation(actor.tenantId, session.declaredBytes, BigInt(actualBytes));

    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "library.upload_complete",
      tenantId: actor.tenantId,
      targetType: "LibraryItem",
      targetId: item.id,
      after: { name: item.name, sizeBytes: actualBytes, parts: session.totalParts } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok({ item: { ...item, sizeBytes: Number(item.sizeBytes) } }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
