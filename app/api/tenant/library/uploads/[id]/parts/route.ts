import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { presignUploadPart } from "@/lib/storage/s3";

const PART_URL_TTL_SECONDS = 60 * 60;

/** Presigned URLs are issued in windows so one round trip covers several parts. */
const PresignBody = z.object({
  partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(32),
});

const RecordBody = z.object({
  partNumber: z.number().int().min(1).max(10_000),
  etag: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive(),
});

async function loadPendingSession(tenantId: string, id: string) {
  const session = await prisma.libraryUpload.findFirst({ where: { id, tenantId } });
  if (!session) throw new DomainError(404, "not_found", "Upload session not found.");
  if (session.status !== "PENDING") {
    throw new DomainError(409, "session_closed", "This upload is no longer active.");
  }
  if (session.expiresAt.getTime() < Date.now()) {
    throw new DomainError(410, "session_expired", "This upload expired. Start it again.");
  }
  return session;
}

/** Presign a batch of parts. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_WRITE.key);
    const { id } = await ctx.params;
    const { partNumbers } = PresignBody.parse(await request.json());
    const session = await loadPendingSession(actor.tenantId, id);

    for (const n of partNumbers) {
      if (n > session.totalParts) {
        throw new DomainError(400, "bad_part", `Part ${n} is beyond this upload's part count.`);
      }
    }

    const urls = await Promise.all(
      [...new Set(partNumbers)].map(async (partNumber) => ({
        partNumber,
        url: await presignUploadPart({
          key: session.key,
          uploadId: session.uploadId,
          partNumber,
          expiresIn: PART_URL_TTL_SECONDS,
        }),
      }))
    );

    return ok({ parts: urls, expiresInSeconds: PART_URL_TTL_SECONDS });
  } catch (e) {
    return handleError(e);
  }
}

/** Record a landed part's ETag. Idempotent — a retried part overwrites cleanly. */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_WRITE.key);
    const { id } = await ctx.params;
    const body = RecordBody.parse(await request.json());
    const session = await loadPendingSession(actor.tenantId, id);

    if (body.partNumber > session.totalParts) {
      throw new DomainError(400, "bad_part", "Part number is beyond this upload's part count.");
    }

    const existing = await prisma.libraryUploadPart.findUnique({
      where: { uploadId_partNumber: { uploadId: session.id, partNumber: body.partNumber } },
    });

    await prisma.libraryUploadPart.upsert({
      where: { uploadId_partNumber: { uploadId: session.id, partNumber: body.partNumber } },
      create: {
        tenantId: actor.tenantId,
        uploadId: session.id,
        partNumber: body.partNumber,
        etag: body.etag,
        sizeBytes: body.sizeBytes,
      },
      update: { etag: body.etag, sizeBytes: body.sizeBytes },
    });

    // Progress only — the committed size comes from HeadObject at completion.
    // Re-recording a part must not double-count it.
    const delta = BigInt(body.sizeBytes - (existing?.sizeBytes ?? 0));
    await prisma.libraryUpload.update({
      where: { id: session.id },
      data: { uploadedBytes: { increment: delta } },
    });

    return ok({ recorded: true });
  } catch (e) {
    return handleError(e);
  }
}
