"use client";

import { apiPost } from "./api";

type PresignResult = { url: string; key: string; publicUrl: string };
export type UploadResult = { key: string; publicUrl: string; contentType: string; size: number } | { error: string };

/**
 * Presign an upload via the given endpoint, then PUT the file directly to
 * object storage. `extra` carries endpoint-specific fields (e.g. { kind }).
 */
export async function uploadViaPresign(
  presignPath: string,
  file: File,
  extra: Record<string, unknown> = {}
): Promise<UploadResult> {
  const pres = await apiPost<PresignResult>(presignPath, {
    contentType: file.type,
    contentLength: file.size,
    ...extra,
  });
  if (pres.error || !pres.data) {
    return { error: pres.error?.message ?? "Could not start upload." };
  }
  const put = await fetch(pres.data.url, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!put.ok) return { error: "Upload to storage failed." };
  return { key: pres.data.key, publicUrl: pres.data.publicUrl, contentType: file.type, size: file.size };
}
