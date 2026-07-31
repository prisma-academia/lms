import type { MediaKind } from "@/lib/generated/prisma/enums";
import type { IconName } from "@/components/icon";

/**
 * Content type -> MediaKind. Shared by the upload path (which stamps
 * LibraryItem.mediaKind at creation) and by the UI, so a file always renders
 * with the same player everywhere.
 *
 * Kept deliberately broad: anything unrecognised is OTHER, which the viewer
 * renders as a download card rather than guessing wrong.
 */

const EXACT: Record<string, MediaKind> = {
  "application/pdf": "PDF",
  "application/zip": "ARCHIVE",
  "application/x-7z-compressed": "ARCHIVE",
  "application/gzip": "ARCHIVE",
  "application/x-tar": "ARCHIVE",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOC",
  "application/vnd.ms-powerpoint": "DOC",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "DOC",
  "application/vnd.ms-excel": "DOC",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "DOC",
  "application/vnd.oasis.opendocument.text": "DOC",
  "application/vnd.oasis.opendocument.spreadsheet": "DOC",
  "application/vnd.oasis.opendocument.presentation": "DOC",
  "application/epub+zip": "DOC",
  "text/plain": "DOC",
  "text/csv": "DOC",
  // Subtitle sidecars: documents, not playable media in their own right.
  "text/vtt": "DOC",
  "application/x-subrip": "DOC",
};

export function mediaKindForContentType(contentType: string): MediaKind {
  const ct = contentType.toLowerCase().split(";")[0].trim();
  const exact = EXACT[ct];
  if (exact) return exact;
  if (ct.startsWith("video/")) return "VIDEO";
  if (ct.startsWith("audio/")) return "AUDIO";
  if (ct.startsWith("image/")) return "IMAGE";
  if (ct.startsWith("text/")) return "DOC";
  return "OTHER";
}

/**
 * Extension -> MediaKind, used only to repair items stored as OTHER.
 *
 * Uploads that arrive with a generic or missing Content-Type (S3 defaults to
 * application/octet-stream, and some browsers send nothing for a drag-drop)
 * land in the OTHER bucket, and OTHER renders as a download card. The filename
 * is the last honest signal we have, so a "worksheet.pdf" still opens in the
 * PDF viewer instead of forcing a download.
 */
const BY_EXTENSION: Record<string, MediaKind> = {
  pdf: "PDF",
  mp4: "VIDEO", webm: "VIDEO", mov: "VIDEO", m4v: "VIDEO", ogv: "VIDEO", mkv: "VIDEO",
  mp3: "AUDIO", wav: "AUDIO", m4a: "AUDIO", aac: "AUDIO", oga: "AUDIO", flac: "AUDIO",
  png: "IMAGE", jpg: "IMAGE", jpeg: "IMAGE", gif: "IMAGE", webp: "IMAGE", avif: "IMAGE",
  bmp: "IMAGE", svg: "IMAGE",
  txt: "DOC", csv: "DOC", md: "DOC", markdown: "DOC", json: "DOC", xml: "DOC",
  yml: "DOC", yaml: "DOC", log: "DOC",
  doc: "DOC", docx: "DOC", xls: "DOC", xlsx: "DOC", ppt: "DOC", pptx: "DOC",
  odt: "DOC", ods: "DOC", odp: "DOC", epub: "DOC",
  zip: "ARCHIVE", "7z": "ARCHIVE", tar: "ARCHIVE", gz: "ARCHIVE", rar: "ARCHIVE",
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/**
 * The kind an item should actually render as.
 *
 * A stored kind is trusted whenever it is decisive. Only OTHER — the
 * "we could not tell" bucket — is re-derived, first from the content type and
 * then from the filename. This can promote an item into a real viewer; it can
 * never demote one that was classified correctly at upload.
 */
export function resolveMediaKind(item: {
  mediaKind: MediaKind | string;
  contentType?: string | null;
  name?: string | null;
}): MediaKind {
  const stored = item.mediaKind as MediaKind;
  if (stored && stored !== "OTHER") return stored;

  const fromType = item.contentType ? mediaKindForContentType(item.contentType) : "OTHER";
  if (fromType !== "OTHER") return fromType;

  return (item.name ? BY_EXTENSION[extensionOf(item.name)] : undefined) ?? "OTHER";
}

/** Content types this app can render as text in-page rather than download. */
const TEXT_EXTENSIONS = new Set([
  "txt", "csv", "md", "markdown", "json", "xml", "yml", "yaml", "log",
]);

/**
 * True for DOC items that are plain text underneath, so they can be shown
 * in-page. Word/Excel/PowerPoint are DOC too but need a conversion service —
 * they stay download-only.
 */
export function isInlineTextDoc(item: { contentType?: string | null; name?: string | null }): boolean {
  const ct = (item.contentType ?? "").toLowerCase().split(";")[0].trim();
  if (ct === "application/json" || ct === "application/xml") return true;
  if (ct.startsWith("text/") && ct !== "text/vtt" && ct !== "text/html") return true;
  return item.name ? TEXT_EXTENSIONS.has(extensionOf(item.name)) : false;
}

/** Kinds that render in a real viewer rather than a download card. */
export function rendersInline(kind: MediaKind): boolean {
  return kind === "VIDEO" || kind === "AUDIO" || kind === "PDF" || kind === "IMAGE";
}

/** True when the learner gets a real player rather than a download card. */
export function isPlayable(kind: MediaKind): boolean {
  return kind === "VIDEO" || kind === "AUDIO";
}

/** Kinds whose playback position is worth remembering. */
export function tracksPosition(kind: MediaKind): boolean {
  return isPlayable(kind);
}

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  VIDEO: "Video",
  AUDIO: "Audio",
  PDF: "PDF",
  IMAGE: "Image",
  DOC: "Document",
  ARCHIVE: "Archive",
  OTHER: "File",
};

export const MEDIA_KIND_ICON: Record<MediaKind, IconName> = {
  VIDEO: "video",
  AUDIO: "audio",
  PDF: "file",
  IMAGE: "image",
  DOC: "clipboard",
  ARCHIVE: "archive",
  OTHER: "file",
};

/**
 * Decorative per-kind tile colour, following the StatCard idiom. These are the
 * one place --chart-N is appropriate: the meaning is "different", not "good" or
 * "bad", so the semantic status tokens would be wrong here.
 */
export const MEDIA_KIND_ACCENT: Record<MediaKind, string> = {
  VIDEO: "var(--chart-1)",
  AUDIO: "var(--chart-2)",
  PDF: "var(--chart-3)",
  IMAGE: "var(--chart-4)",
  DOC: "var(--chart-5)",
  ARCHIVE: "var(--chart-2)",
  OTHER: "var(--chart-3)",
};

export const ALL_MEDIA_KINDS: MediaKind[] = [
  "VIDEO",
  "AUDIO",
  "PDF",
  "IMAGE",
  "DOC",
  "ARCHIVE",
  "OTHER",
];
