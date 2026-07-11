import { z } from "zod";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { createPresignedUpload, isAllowedUploadType, s3Configured, MAX_ASSET_BYTES } from "@/lib/storage/s3";
import { assertStorageQuota } from "@/lib/storage/quota";

const Body = z.object({
  contentType: z.string().min(1),
  contentLength: z.number().int().positive().optional(),
});

/** Presign an assignment-submission upload for the current learner. */
export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { contentType, contentLength } = Body.parse(await request.json());

    if (!s3Configured()) {
      throw new DomainError(503, "storage_unconfigured", "Object storage is not configured.");
    }
    if (!isAllowedUploadType(contentType, "submission")) {
      throw new DomainError(400, "bad_type", "Unsupported file type.");
    }
    const size = contentLength ?? MAX_ASSET_BYTES.submission;
    if (size > MAX_ASSET_BYTES.submission) {
      throw new DomainError(400, "file_too_large", "File exceeds the maximum submission size (25 MB).");
    }
    await assertStorageQuota(actor.tenantId, size);

    const presigned = await createPresignedUpload({
      tenantId: actor.tenantId,
      contentType,
      kind: "submission",
      contentLength: size,
    });
    return ok(presigned);
  } catch (e) {
    return handleError(e);
  }
}
