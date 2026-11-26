import { z } from "zod";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { createPresignedUpload, isAllowedUploadType, s3Configured, MAX_ASSET_BYTES } from "@/lib/storage/s3";
import { assertStorageQuota } from "@/lib/storage/quota";

/**
 * What a learner may upload, and what the refusal says for each.
 *
 * `submission` is the default so existing callers (assignment uploads), which
 * send no `kind`, keep working unchanged.
 */
const KINDS = {
  submission: {
    badType: "Unsupported file type.",
    tooLarge: "File exceeds the maximum submission size (25 MB).",
  },
  avatar: {
    badType: "A profile photo must be a PNG, JPEG or WebP image.",
    tooLarge: "That photo is too large. Choose one under 2 MB.",
  },
  profile_document: {
    badType: "Proof of a certification must be a PDF, or a PNG, JPEG or WebP image.",
    tooLarge: "That document is too large. Choose one under 5 MB.",
  },
} as const;

const Body = z.object({
  kind: z.enum(["submission", "avatar", "profile_document"]).default("submission"),
  contentType: z.string().min(1),
  contentLength: z.number().int().positive().optional(),
});

/** Presign an upload for the current learner: an assignment file, a profile photo, or a proof document. */
export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { kind, contentType, contentLength } = Body.parse(await request.json());
    const messages = KINDS[kind];

    if (!s3Configured()) {
      throw new DomainError(503, "storage_unconfigured", "Object storage is not configured.");
    }
    if (!isAllowedUploadType(contentType, kind)) {
      throw new DomainError(400, "bad_type", messages.badType);
    }
    // The signed link pins the size, so the browser must send exactly this many
    // bytes. Profile uploads therefore have to declare their size: defaulting to
    // the cap, as submissions do, would only produce a link that cannot be used.
    if (kind !== "submission" && contentLength == null) {
      throw new DomainError(400, "invalid_size", "The file's size is required.");
    }
    const size = contentLength ?? MAX_ASSET_BYTES[kind];
    if (size > MAX_ASSET_BYTES[kind]) {
      throw new DomainError(400, "file_too_large", messages.tooLarge);
    }
    await assertStorageQuota(actor.tenantId, size);

    const presigned = await createPresignedUpload({
      tenantId: actor.tenantId,
      contentType,
      kind,
      contentLength: size,
      // Puts profile uploads under this learner's own prefix. The id comes from
      // the session, never from the request.
      clientId: actor.clientId,
    });

    // Profile files are private: they are read back through a signed link, so
    // there is no public address to hand out for them.
    if (kind !== "submission") return ok({ url: presigned.url, key: presigned.key });
    return ok(presigned);
  } catch (e) {
    return handleError(e);
  }
}
