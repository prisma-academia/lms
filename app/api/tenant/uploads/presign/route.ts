import { z } from "zod";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import type { PermissionKey } from "@/lib/auth/permissions";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import {
  createPresignedUpload,
  isAllowedUploadType,
  s3Configured,
  MAX_ASSET_BYTES,
  type PresignKind,
} from "@/lib/storage/s3";
import { assertStorageQuota } from "@/lib/storage/quota";

const Body = z.object({
  kind: z.enum(["course_thumbnail", "lesson_asset", "resource"]),
  contentType: z.string().min(1),
  contentLength: z.number().int().positive().optional(),
  courseId: z.string().min(1).optional(),
});

const PERMISSION_FOR_KIND: Record<string, PermissionKey> = {
  course_thumbnail: PERMISSIONS.TENANT_COURSES_WRITE.key,
  lesson_asset: PERMISSIONS.TENANT_COURSES_WRITE.key,
  resource: PERMISSIONS.TENANT_RESOURCES_WRITE.key,
};

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const body = Body.parse(await request.json());
    const kind = body.kind as PresignKind;
    const actor = await requireTenantActor(PERMISSION_FOR_KIND[body.kind]);

    if (!s3Configured()) {
      throw new DomainError(503, "storage_unconfigured", "Object storage is not configured.");
    }
    if (!isAllowedUploadType(body.contentType, kind)) {
      throw new DomainError(400, "bad_type", "Unsupported file type.");
    }
    const max = MAX_ASSET_BYTES[kind];
    const size = body.contentLength ?? max;
    if (size > max) {
      throw new DomainError(400, "file_too_large", "File exceeds the maximum size for this upload.");
    }
    await assertStorageQuota(actor.tenantId, size);

    const presigned = await createPresignedUpload({
      tenantId: actor.tenantId,
      contentType: body.contentType,
      kind,
      contentLength: size,
      courseId: body.courseId,
    });
    return ok(presigned);
  } catch (e) {
    return handleError(e);
  }
}
