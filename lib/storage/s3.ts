import { randomBytes } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
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

export type PresignKind = "logo" | "course_thumbnail" | "lesson_asset" | "resource" | "submission";

const ASSET_CONTENT_TYPES: Record<string, string> = {
  ...CONTENT_TYPE_EXT,
  "application/pdf": "pdf",
  "video/mp4": "mp4",
};

// Broad set for the resource library and assignment submissions.
const RESOURCE_CONTENT_TYPES: Record<string, string> = {
  ...ASSET_CONTENT_TYPES,
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "video/webm": "webm",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
  "text/plain": "txt",
  "text/csv": "csv",
};

export const MAX_ASSET_BYTES: Record<PresignKind, number> = {
  logo: 2 * 1024 * 1024,
  course_thumbnail: 5 * 1024 * 1024,
  lesson_asset: 100 * 1024 * 1024,
  resource: 100 * 1024 * 1024,
  submission: 25 * 1024 * 1024,
};

function contentTypeMapFor(kind: PresignKind): Record<string, string> {
  if (kind === "logo") return CONTENT_TYPE_EXT;
  if (kind === "resource" || kind === "submission") return RESOURCE_CONTENT_TYPES;
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
  } else if (input.kind === "resource") {
    key = `tenants/${input.tenantId}/resources/${rand}.${ext}`;
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

/** @deprecated use isAllowedUploadType */
export function isAllowedImageType(contentType: string): boolean {
  return contentType in CONTENT_TYPE_EXT;
}
