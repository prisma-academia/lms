import { z } from "zod";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { createPresignedUpload, isAllowedImageType, s3Configured, MAX_ASSET_BYTES } from "@/lib/storage/s3";
import { assertStorageQuota } from "@/lib/storage/quota";
import { formatBytes } from "@/lib/tenant/plan";

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
      throw new DomainError(
        503,
        "storage_unconfigured",
        "Object storage is not configured, so logo uploads are disabled. Ask your platform administrator to configure the S3 settings."
      );
    }
    if (!isAllowedImageType(contentType)) {
      throw new DomainError(
        400,
        "bad_type",
        `Logo must be a PNG, JPEG, or WebP image — the file was sent as "${contentType}". SVG is not accepted.`
      );
    }
    const size = contentLength ?? MAX_ASSET_BYTES.logo;
    if (size > MAX_ASSET_BYTES.logo) {
      throw new DomainError(
        400,
        "file_too_large",
        `Logo is ${formatBytes(BigInt(size))}, over the ${formatBytes(
          BigInt(MAX_ASSET_BYTES.logo)
        )} limit. Export it at a smaller size or save it as WebP.`
      );
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
