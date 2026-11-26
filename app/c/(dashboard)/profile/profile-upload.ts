"use client";

import { apiPost } from "@/lib/client/api";
import {
  AVATAR_RULES,
  formatBytes,
  precheckImage,
  putFileToStorage,
  squareImage,
} from "@/lib/client/image-upload";

/**
 * Uploads for a learner's own profile: their photo and proof documents.
 *
 * Both go straight from the browser to object storage through a signed link.
 * What comes back is a storage key, which means nothing until the profile is
 * saved with it — the server checks then that the key is this learner's and
 * that the file really arrived.
 */

export type UploadOutcome = { ok: true; key: string } | { ok: false; message: string };

/** Keep in step with `MAX_ASSET_BYTES` in lib/storage/s3.ts. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
export const PHOTO_ACCEPT = AVATAR_RULES.types.join(",");
export const DOCUMENT_ACCEPT = DOCUMENT_TYPES.join(",");

async function send(kind: "avatar" | "profile_document", file: File): Promise<UploadOutcome> {
  const presigned = await apiPost<{ url: string; key: string }>("/api/client/uploads/presign", {
    kind,
    contentType: file.type,
    contentLength: file.size,
  });
  if (presigned.error || !presigned.data) {
    return { ok: false, message: presigned.error?.message ?? "The upload could not be started. Try again." };
  }
  const put = await putFileToStorage({ url: presigned.data.url, file, contentType: file.type });
  if (!put.ok) return { ok: false, message: put.message };
  return { ok: true, key: presigned.data.key };
}

/** Check, crop to a square, shrink and upload a profile photo. */
export async function uploadPhoto(file: File): Promise<UploadOutcome> {
  const problem = await precheckImage(file, AVATAR_RULES);
  if (problem) return { ok: false, message: problem };

  const prepared = await squareImage(file);
  if (prepared.size > MAX_PHOTO_BYTES) {
    // Only reachable when the browser could not resize the image for us.
    return {
      ok: false,
      message: `This photo is ${formatBytes(prepared.size)} and could not be made smaller in this browser. Choose one under ${formatBytes(MAX_PHOTO_BYTES)}.`,
    };
  }
  return send("avatar", prepared);
}

/** Say what is wrong with a proof document, before anything is sent. */
export function documentProblem(file: File): string | null {
  if (file.size === 0) return `“${file.name}” is empty. Choose the file again.`;
  if (!DOCUMENT_TYPES.includes(file.type)) {
    return `“${file.name}” can't be used. Proof must be a PDF, or a PNG, JPEG or WebP image.`;
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `“${file.name}” is ${formatBytes(file.size)}. Proof documents can be up to ${formatBytes(MAX_DOCUMENT_BYTES)}.`;
  }
  return null;
}

export async function uploadDocument(file: File): Promise<UploadOutcome> {
  const problem = documentProblem(file);
  if (problem) return { ok: false, message: problem };
  return send("profile_document", file);
}
