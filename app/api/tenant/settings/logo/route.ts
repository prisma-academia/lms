import { z } from "zod";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { createPresignedUpload, isAllowedImageType, s3Configured, MAX_ASSET_BYTES } from "@/lib/storage/s3";
import { assertStorageQuota } from "@/lib/storage/quota";

const Body = z.object({
  contentType: z.string().min(1),
  contentLength: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SETTINGS_WRITE.key);
    const { contentType, contentLength } = Body.parse(await request.json());

    if (!s3Configured()) {
      throw new DomainError(503, "storage_unconfigured", "Object storage is not configured.");
    }
    if (!isAllowedImageType(contentType)) {
      throw new DomainError(400, "bad_type", "Logo must be a PNG, JPEG, or WebP image.");
    }
    const size = contentLength ?? MAX_ASSET_BYTES.logo;
    if (size > MAX_ASSET_BYTES.logo) {
      throw new DomainError(400, "file_too_large", "Logo must be 2 MB or smaller.");
    }
    await assertStorageQuota(actor.tenantId, size);

    const presigned = await createPresignedUpload({
      tenantId: actor.tenantId,
      contentType,
      kind: "logo",
      contentLength: size,
    });
    return ok(presigned);
  } catch (e) {
    return handleError(e);
  }
}
