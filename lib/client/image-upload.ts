"use client";

/**
 * Browser-side pre-flight for branding image uploads.
 *
 * The server stays the authority — `app/api/tenant/settings/logo/route.ts`
 * re-checks type/size and `lib/tenant/branding-assets.ts` re-checks dimensions
 * on the decoded bytes. This module exists so a bad file is rejected with a
 * precise message *before* it is pushed over the wire, and so a failed PUT to
 * object storage reports what actually went wrong instead of "Upload failed."
 *
 * Keep the limits here in sync with `MAX_ASSET_BYTES` / `MIN_LOGO_SIDE_PX` in
 * `lib/storage/s3.ts` and the aspect bounds in `lib/tenant/branding-assets.ts`.
 */

export type ImageRules = {
  /** Human label used in messages, e.g. "Logo". */
  label: string;
  types: string[];
  maxBytes: number;
  minSidePx: number;
  minAspect: number;
  maxAspect: number;
  /** How the aspect window reads to a human, e.g. "between 1:3 and 3:1". */
  aspectHint: string;
  /**
   * Why the minimum size exists, completing "must be at least N×N pixels …".
   * Defaults to the branding reason; set it for anything that is not a logo.
   */
  minSideReason?: string;
};

export const LOGO_RULES: ImageRules = {
  label: "Logo",
  types: ["image/png", "image/jpeg", "image/webp"],
  maxBytes: 2 * 1024 * 1024,
  minSidePx: 256,
  minAspect: 1 / 3,
  maxAspect: 3,
  aspectHint: "between 1:3 and 3:1",
};

export const FAVICON_RULES: ImageRules = {
  label: "Favicon",
  types: ["image/png", "image/jpeg", "image/webp"],
  maxBytes: 512 * 1024,
  minSidePx: 32,
  minAspect: 0.8,
  maxAspect: 1.25,
  aspectHint: "roughly square (between 0.8 and 1.25)",
};

/**
 * A learner's profile photo. The limits apply to the file as picked: it is
 * cropped square and scaled down by `squareImage` before it is sent, so a
 * photo straight off a phone camera is fine and the aspect window is wide.
 */
export const AVATAR_RULES: ImageRules = {
  label: "Photo",
  types: ["image/png", "image/jpeg", "image/webp"],
  maxBytes: 15 * 1024 * 1024,
  minSidePx: 128,
  minAspect: 1 / 4,
  maxAspect: 4,
  aspectHint: "no more than four times as wide as it is tall, or the reverse",
  minSideReason: "so it stays sharp",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "a .svg file", "a PDF", … — whatever we can say confidently about the file. */
function describeType(file: File): string {
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  if (ext) return `a .${ext} file`;
  if (file.type) return `a ${file.type} file`;
  return "an unrecognized file type";
}

function typeList(rules: ImageRules): string {
  return rules.types
    .map((t) => t.replace("image/", "").toUpperCase())
    .join(", ")
    .replace(/, ([^,]*)$/, " or $1");
}

type Dimensions = { width: number; height: number };

/**
 * Decode just far enough to read the intrinsic size. Resolves `null` when the
 * environment cannot decode at all (very old browser) — the server still
 * validates, so we let those through rather than blocking on a false negative.
 * Resolves `"undecodable"` when the browser actively failed to parse the image.
 */
function readDimensions(file: File): Promise<Dimensions | null | "undecodable"> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof URL.createObjectURL !== "function") {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      URL.revokeObjectURL(url);
      resolve(width > 0 && height > 0 ? { width, height } : "undecodable");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("undecodable");
    };
    img.src = url;
  });
}

function ratioLabel(width: number, height: number): string {
  return width >= height
    ? `${(width / height).toFixed(1)}:1`
    : `1:${(height / width).toFixed(1)}`;
}

/**
 * Validate a picked file against `rules`. Returns a ready-to-show message
 * explaining exactly what is wrong, or `null` when the file looks acceptable.
 */
export async function precheckImage(
  file: File,
  rules: ImageRules
): Promise<string | null> {
  const name = `“${file.name}”`;

  if (file.size === 0) {
    return `${name} is empty (0 bytes). Pick the file again — it may still have been copying.`;
  }
  if (!rules.types.includes(file.type)) {
    return `${name} is ${describeType(file)}. The ${rules.label.toLowerCase()} must be a ${typeList(
      rules
    )} image — SVG and other formats are not accepted.`;
  }
  if (file.size > rules.maxBytes) {
    return `${name} is ${formatBytes(file.size)}, over the ${formatBytes(
      rules.maxBytes
    )} limit for the ${rules.label.toLowerCase()}. Export it at a smaller size or save it as WebP, then try again.`;
  }

  const dims = await readDimensions(file);
  if (dims === "undecodable") {
    return `${name} could not be read as an image. It may be corrupt, or the file extension may not match its real format.`;
  }
  if (!dims) return null;

  const { width, height } = dims;
  if (width < rules.minSidePx || height < rules.minSidePx) {
    return `${name} is ${width}×${height} pixels. The ${rules.label.toLowerCase()} must be at least ${
      rules.minSidePx
    }×${rules.minSidePx} pixels ${
      rules.minSideReason ?? "so the generated favicon and social image stay sharp"
    }.`;
  }
  const aspect = width / height;
  if (aspect < rules.minAspect || aspect > rules.maxAspect) {
    return `${name} is ${width}×${height} pixels (${ratioLabel(
      width,
      height
    )}). The ${rules.label.toLowerCase()} aspect ratio must be ${
      rules.aspectHint
    } — crop the surrounding whitespace and try again.`;
  }
  return null;
}

/**
 * Crop an image to a centred square and scale it down to `size` pixels.
 *
 * A profile photo is shown at 96px at most; sending a 6 MB camera original for
 * that wastes the learner's data and the academy's storage. The result is
 * WebP where the browser can encode it and PNG where it cannot.
 *
 * Returns the original file untouched if anything here is unavailable or
 * fails — an old browser should still be able to upload a photo, and the
 * server enforces its own size limit either way.
 */
export async function squareImage(file: File, size = 512): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return file;
  try {
    // `from-image` applies the EXIF rotation, so a portrait phone photo is not
    // stored lying on its side.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const side = Math.min(bitmap.width, bitmap.height);
    if (side <= 0) return file;
    const out = Math.min(size, side);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
    if (!blob || blob.size === 0) return file;
    // A browser that cannot encode WebP hands back a PNG instead of failing.
    const extension = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : null;
    if (!extension) return file;
    return new File([blob], `photo.${extension}`, { type: blob.type });
  } catch {
    return file;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "object storage";
  }
}

/** Pull `<Code>`/`<Message>` out of an S3 XML error body, if there is one. */
async function readStorageErrorDetail(res: Response): Promise<string> {
  try {
    const text = (await res.text()).trim();
    if (!text) return "";
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
    const message = /<Message>([^<]+)<\/Message>/.exec(text)?.[1];
    const parsed = [code, message].filter(Boolean).join(": ");
    return parsed || text.slice(0, 180);
  } catch {
    return "";
  }
}

function explainStatus(status: number, statusText: string, host: string): string {
  if (status === 400) {
    return `Object storage rejected the upload as a bad request (400). The signed link did not match what the browser sent — usually a content-type or checksum mismatch.`;
  }
  if (status === 401 || status === 403) {
    return `Object storage refused the upload (${status}). Upload links expire after 5 minutes, so try again; if it keeps failing, the storage credentials or bucket policy need attention.`;
  }
  if (status === 404) {
    return `Object storage returned 404 for ${host} — the configured bucket does not exist at that endpoint.`;
  }
  if (status === 413) {
    return `Object storage rejected the file as too large (413).`;
  }
  if (status === 429) {
    return `Object storage is rate-limiting uploads (429). Wait a moment and try again.`;
  }
  if (status >= 500) {
    return `Object storage is returning ${status} from ${host}. This is a storage-side problem — try again shortly.`;
  }
  return `Object storage rejected the upload (${status}${statusText ? ` ${statusText}` : ""}).`;
}

export type PutResult = { ok: true } | { ok: false; message: string };

/**
 * PUT a file straight to object storage via a presigned URL.
 *
 * A cross-origin PUT that is blocked (CORS, DNS, offline, TLS) rejects with an
 * opaque `TypeError`, which is why this is wrapped: without it the upload fails
 * silently and the form just stops.
 */
export async function putFileToStorage(input: {
  url: string;
  file: File;
  contentType: string;
}): Promise<PutResult> {
  const host = hostOf(input.url);
  let res: Response;
  try {
    res = await fetch(input.url, {
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      body: input.file,
    });
  } catch (err) {
    console.error("[upload] PUT to object storage failed", { host, err });
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return {
        ok: false,
        message: "You appear to be offline. Reconnect and try the upload again.",
      };
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "this site";
    return {
      ok: false,
      message: `The browser could not reach object storage at ${host}. This is usually a missing CORS rule on the bucket — it must allow PUT from ${origin} — or a storage host that is down or blocked by the network.`,
    };
  }

  if (res.ok) return { ok: true };

  const detail = await readStorageErrorDetail(res);
  console.error("[upload] object storage returned an error", {
    host,
    status: res.status,
    detail,
  });
  const base = explainStatus(res.status, res.statusText, host);
  return { ok: false, message: detail ? `${base} Storage said: ${detail}` : base };
}
