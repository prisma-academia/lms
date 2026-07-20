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
