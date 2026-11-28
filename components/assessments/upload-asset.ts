"use client";

import { apiPost } from "@/lib/client/api";
import { putFileToStorage } from "@/lib/client/image-upload";

/**
 * Upload a picture, clip or video for a question (staff) and return its public
 * URL. Storage may be unconfigured on a dev machine; the caller then offers a
 * pasted URL instead.
 */
export async function uploadQuestionAsset(file: File): Promise<{ url: string } | { error: string }> {
  const res = await apiPost<{ url: string; key: string; publicUrl: string }>("/api/tenant/uploads/presign", {
    kind: "question_asset",
    contentType: file.type,
    contentLength: file.size,
  });
  if (res.error || !res.data) return { error: res.error?.message ?? "Could not start the upload." };
  const put = await putFileToStorage({ url: res.data.url, file, contentType: file.type });
  if (!put.ok) return { error: put.message };
  return { url: res.data.publicUrl };
}
