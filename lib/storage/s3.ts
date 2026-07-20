import { randomBytes } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

/**
 * Tenant branding object storage (PRD §5.8, §8.3, §16.6).
 *
 * Works with AWS S3 and S3-compatible self-hosted backends (MinIO, Ceph
 * RGW, Garage, etc.). For self-hosted, set S3_ENDPOINT (e.g.
 * http://localhost:9000); path-style addressing and a default region are
 * applied automatically.
 *
 * SVG is intentionally NOT allowed (stored-XSS vector for logos rendered
 * inline). Uploads are presigned PUTs with a short expiry and a pinned
 * content-type.
 */

// MinIO/self-hosted default. AWS S3 also accepts us-east-1 globally.
const DEFAULT_REGION = "us-east-1";

export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type PresignKind = "logo" | "course_thumbnail" | "lesson_asset" | "library" | "submission";

const ASSET_CONTENT_TYPES: Record<string, string> = {
  ...CONTENT_TYPE_EXT,
  "application/pdf": "pdf",
  "video/mp4": "mp4",
};

// Broad set for the media library and assignment submissions.
//
// SVG remains excluded (stored-XSS vector — see the file header). Everything
// here is either a container the browser can render or an inert download.
const LIBRARY_CONTENT_TYPES: Record<string, string> = {
  ...ASSET_CONTENT_TYPES,
  // Images
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/tiff": "tiff",
  // Audio
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/webm": "weba",
  // Video
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "video/mpeg": "mpeg",
  "video/x-msvideo": "avi",
  // Documents
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/epub+zip": "epub",
  "text/plain": "txt",
  "text/csv": "csv",
  // Subtitle sidecars for the video player.
  "text/vtt": "vtt",
  "application/x-subrip": "srt",
  // Archives
  "application/zip": "zip",
  "application/x-7z-compressed": "7z",
  "application/gzip": "gz",
  "application/x-tar": "tar",
};

export const MAX_ASSET_BYTES: Record<PresignKind, number> = {
  logo: 2 * 1024 * 1024,
  course_thumbnail: 5 * 1024 * 1024,
  lesson_asset: 100 * 1024 * 1024,
  library: 2 * 1024 * 1024 * 1024, // 2 GB — resumable multipart, see below.
  submission: 25 * 1024 * 1024,
};

/** S3 requires every part except the last to be at least 5 MiB. */
export const MIN_PART_BYTES = 5 * 1024 * 1024;
/** 2 GB at 16 MiB is ~128 parts, far under S3's 10,000-part ceiling. */
export const DEFAULT_PART_BYTES = 16 * 1024 * 1024;
export const MAX_PARTS = 10_000;

/**
 * Part size for a given total. Grows the part size rather than the part count
 * so a large file never exceeds MAX_PARTS.
 */
export function partSizeFor(totalBytes: number): number {
  const needed = Math.ceil(totalBytes / (MAX_PARTS - 1));
  const size = Math.max(DEFAULT_PART_BYTES, MIN_PART_BYTES, needed);
  // Round up to a whole MiB so part boundaries stay easy to reason about.
  return Math.ceil(size / (1024 * 1024)) * 1024 * 1024;
}

/** Anything at or below this uploads as a single PUT — multipart is overhead. */
export const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;

function contentTypeMapFor(kind: PresignKind): Record<string, string> {
  if (kind === "logo") return CONTENT_TYPE_EXT;
  if (kind === "library" || kind === "submission") return LIBRARY_CONTENT_TYPES;
  return ASSET_CONTENT_TYPES;
}

export function isAllowedUploadType(contentType: string, kind: PresignKind): boolean {
  return contentType in contentTypeMapFor(kind);
}

export function s3Configured(): boolean {
  // Region is optional for S3-compatible endpoints (a default is applied);
  // AWS proper still needs it explicitly.
  const hasRegion = Boolean(env.S3_REGION || env.S3_ENDPOINT);
  return Boolean(
    hasRegion &&
      env.S3_BUCKET &&
      env.S3_ACCESS_KEY_ID &&
      env.S3_SECRET_ACCESS_KEY
  );
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!s3Configured()) {
    throw new Error("S3 is not configured (S3_REGION/S3_BUCKET/credentials).");
  }
  if (!client) {
    // Default to path-style whenever a custom endpoint is set unless the
    // operator explicitly opts out (S3_FORCE_PATH_STYLE=false).
    const forcePathStyle = env.S3_ENDPOINT
      ? env.S3_FORCE_PATH_STYLE !== false
      : env.S3_FORCE_PATH_STYLE === true;

    client = new S3Client({
      region: env.S3_REGION ?? DEFAULT_REGION,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      forcePathStyle,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
      // AWS SDK v3 (>= ~3.730) sends CRC32 checksum headers on PutObject by
      // default. Browsers performing the presigned PUT never send that signed
      // header, so MinIO and other gateways reject the upload with a signature
      // mismatch. Only compute checksums when the operation actually requires
      // one — AWS S3 still works, and self-hosted backends accept the PUT.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

export function publicUrlForKey(key: string): string {
  if (env.S3_PUBLIC_BASE_URL) {
    return `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
  if (env.S3_ENDPOINT) {
    return `${env.S3_ENDPOINT.replace(/\/$/, "")}/${env.S3_BUCKET}/${key}`;
  }
  return `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/${key}`;
}

export async function createPresignedUpload(input: {
  tenantId: string;
  contentType: string;
  kind: PresignKind;
  contentLength?: number;
  courseId?: string;
}): Promise<{ url: string; key: string; publicUrl: string }> {
  const extMap = contentTypeMapFor(input.kind);
  const ext = extMap[input.contentType];
  if (!ext) throw new Error("Unsupported content type.");
  const rand = randomBytes(8).toString("hex");
  let key: string;
  if (input.kind === "logo") {
    key = `tenants/${input.tenantId}/branding/${input.kind}-${rand}.${ext}`;
  } else if (input.kind === "library") {
    // Objects uploaded before the resource→library rename still live under
    // `tenants/{id}/resources/`. Those keys keep resolving — only the prefix
    // for NEW uploads changes.
    key = `tenants/${input.tenantId}/library/${rand}.${ext}`;
  } else if (input.kind === "submission") {
    key = `tenants/${input.tenantId}/submissions/${rand}.${ext}`;
  } else if (input.courseId) {
    key = `tenants/${input.tenantId}/courses/${input.courseId}/${input.kind}-${rand}.${ext}`;
  } else {
    key = `tenants/${input.tenantId}/assets/${input.kind}-${rand}.${ext}`;
  }
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET!,
    Key: key,
    ContentType: input.contentType,
    ...(input.contentLength != null ? { ContentLength: input.contentLength } : {}),
  });
  const url = await getSignedUrl(getClient(), command, { expiresIn: 300 });
  return { url, key, publicUrl: publicUrlForKey(key) };
}

export async function createPresignedDownload(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET!,
    Key: key,
  });
  return getSignedUrl(getClient(), command, { expiresIn });
}

/** Build the storage key a new library upload will occupy. */
export function libraryKeyFor(tenantId: string, contentType: string): string {
  const ext = LIBRARY_CONTENT_TYPES[contentType];
  if (!ext) throw new Error("Unsupported content type.");
  return `tenants/${tenantId}/library/${randomBytes(8).toString("hex")}.${ext}`;
}

// ---------------------------------------------------------------------------
// Multipart upload
//
// IMPORTANT: the bucket's CORS policy must expose the ETag response header
// (`ExposeHeaders: ["ETag"]`). The browser uploads each part directly and has
// to read its ETag to complete the upload; without that header the value is
// invisible to JS and completion is impossible. No application code can work
// around it. A lifecycle rule with AbortIncompleteMultipartUpload (7 days) is
// also recommended so abandoned parts do not accrue storage cost.
// ---------------------------------------------------------------------------

export async function createMultipartUpload(input: {
  key: string;
  contentType: string;
}): Promise<{ uploadId: string }> {
  const res = await getClient().send(
    new CreateMultipartUploadCommand({
      Bucket: env.S3_BUCKET!,
      Key: input.key,
      ContentType: input.contentType,
    })
  );
  if (!res.UploadId) throw new Error("S3 did not return an UploadId.");
  return { uploadId: res.UploadId };
}

/**
 * Presign a single part PUT. Deliberately NOT pinned to a ContentLength: the
 * final part is short, and pinning would force the client to know the exact
 * remaining byte count before it starts.
 */
export async function presignUploadPart(input: {
  key: string;
  uploadId: string;
  partNumber: number;
  expiresIn?: number;
}): Promise<string> {
  const command = new UploadPartCommand({
    Bucket: env.S3_BUCKET!,
    Key: input.key,
    UploadId: input.uploadId,
    PartNumber: input.partNumber,
  });
  return getSignedUrl(getClient(), command, { expiresIn: input.expiresIn ?? 3600 });
}

export async function completeMultipartUpload(input: {
  key: string;
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
}): Promise<void> {
  await getClient().send(
    new CompleteMultipartUploadCommand({
      Bucket: env.S3_BUCKET!,
      Key: input.key,
      UploadId: input.uploadId,
      MultipartUpload: {
        // S3 rejects an out-of-order part list.
        Parts: [...input.parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    })
  );
}

export async function abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void> {
  await getClient().send(
    new AbortMultipartUploadCommand({
      Bucket: env.S3_BUCKET!,
      Key: input.key,
      UploadId: input.uploadId,
    })
  );
}

/**
 * Authoritative object size. The client declares a size up front to reserve
 * quota, but a client can under-declare, so the committed size always comes
 * from here rather than from the request body.
 */
export async function headObjectSize(key: string): Promise<number> {
  const res = await getClient().send(
    new HeadObjectCommand({ Bucket: env.S3_BUCKET!, Key: key })
  );
  return Number(res.ContentLength ?? 0);
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET!, Key: key }));
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  // DeleteObjects caps at 1000 keys per call.
  for (let i = 0; i < keys.length; i += 1000) {
    await getClient().send(
      new DeleteObjectsCommand({
        Bucket: env.S3_BUCKET!,
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
      })
    );
  }
}

/** In-flight multipart uploads under a prefix, for the reconcile sweep. */
export async function listMultipartUploads(
  prefix: string
): Promise<{ key: string; uploadId: string; initiated: Date | null }[]> {
  const out: { key: string; uploadId: string; initiated: Date | null }[] = [];
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;
  do {
    const res = await getClient().send(
      new ListMultipartUploadsCommand({
        Bucket: env.S3_BUCKET!,
        Prefix: prefix,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker,
      })
    );
    for (const u of res.Uploads ?? []) {
      if (u.Key && u.UploadId) {
        out.push({ key: u.Key, uploadId: u.UploadId, initiated: u.Initiated ?? null });
      }
    }
    keyMarker = res.IsTruncated ? res.NextKeyMarker : undefined;
    uploadIdMarker = res.IsTruncated ? res.NextUploadIdMarker : undefined;
  } while (keyMarker || uploadIdMarker);
  return out;
}

/** @deprecated use isAllowedUploadType */
export function isAllowedImageType(contentType: string): boolean {
  return contentType in CONTENT_TYPE_EXT;
}
