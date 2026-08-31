import { z } from "zod";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import {
  createPresignedUpload,
  isAllowedUploadType,
  s3Configured,
  MAX_ASSET_BYTES,
} from "@/lib/storage/s3";
import { assertStorageQuota } from "@/lib/storage/quota";
import { formatBytes } from "@/lib/tenant/plan";

/**
 * Presign an image upload for the site builder.
 *
 * Separate from `/api/tenant/uploads/presign` because the permission differs:
 * editing landing pages is `tenant.site:write`, and routing it through the
 * courses/library endpoint would mean either widening that route's permission
 * map or handing site editors permissions they should not have.
 */
const Body = z.object({
  contentType: z.string().min(1),
  contentLength: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_WRITE.key);
    const { contentType, contentLength } = Body.parse(await request.json());

    if (!s3Configured()) {
      throw new DomainError(
        503,
        "storage_unconfigured",
        "Object storage is not configured, so image uploads are disabled. Ask your platform administrator to configure the S3 settings."
      );
    }
    if (!isAllowedUploadType(contentType, "site_asset")) {
      throw new DomainError(
        400,
        "bad_type",
        `Images must be PNG, JPEG, or WebP — the file was sent as "${contentType}". SVG is not accepted.`
      );
    }

    const max = MAX_ASSET_BYTES.site_asset;
    const size = contentLength ?? max;
    if (size > max) {
      throw new DomainError(
        400,
        "file_too_large",
        `That image is ${formatBytes(BigInt(size))}, over the ${formatBytes(
          BigInt(max)
        )} limit. Export it at a smaller size or save it as WebP.`
      );
    }
    await assertStorageQuota(actor.tenantId, size);

    const presigned = await createPresignedUpload({
      tenantId: actor.tenantId,
      contentType,
      kind: "site_asset",
      contentLength: size,
    });
    return ok(presigned);
  } catch (e) {
    return handleError(e);
  }
}
