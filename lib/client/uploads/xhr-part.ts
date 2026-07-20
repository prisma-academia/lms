"use client";

/**
 * PUT one part to a presigned S3 URL.
 *
 * XMLHttpRequest, not fetch: fetch has no upload-progress event, and a
 * multi-gigabyte upload with no per-part progress is indistinguishable from a
 * hung one.
 */

export type PutPartResult =
  | { ok: true; etag: string }
  | { ok: false; status: number; message: string };

export function putPart(input: {
  url: string;
  body: Blob;
  signal?: AbortSignal;
  onProgress?: (sentBytes: number) => void;
}): Promise<PutPartResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", input.url, true);

    const abort = () => xhr.abort();
    input.signal?.addEventListener("abort", abort, { once: true });

    const settle = (r: PutPartResult) => {
      input.signal?.removeEventListener("abort", abort);
      resolve(r);
    };

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) input.onProgress?.(e.loaded);
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        return settle({ ok: false, status: xhr.status, message: `Upload failed (${xhr.status}).` });
      }
      // The bucket CORS policy MUST include ExposeHeaders: ["ETag"]. Without it
      // this reads null even on a successful PUT and the upload can never be
      // completed — so it is reported as a configuration error, not a transient
      // one, because retrying will never fix it.
      const etag = xhr.getResponseHeader("ETag");
      if (!etag) {
        return settle({
          ok: false,
          status: -1,
          message:
            "Storage did not expose the ETag header. The bucket's CORS policy needs ExposeHeaders: [\"ETag\"].",
        });
      }
      settle({ ok: true, etag });
    };

    // Network-level failure: no status is available, so 0 signals "retryable".
    xhr.onerror = () => settle({ ok: false, status: 0, message: "Network error." });
    xhr.ontimeout = () => settle({ ok: false, status: 0, message: "Upload timed out." });
    xhr.onabort = () => settle({ ok: false, status: -2, message: "Aborted." });

    xhr.send(input.body);
  });
}
