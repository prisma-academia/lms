"use client";

import dynamic from "next/dynamic";
import { VideoPlayer } from "./video/video-player";
import { AudioPlayer } from "./audio/audio-player";
import { ImageLightbox } from "./image/image-lightbox";
import { FileCard } from "./file-card";
import { LockedOverlay } from "./locked-overlay";
import { TextViewer } from "./text/text-viewer";
import { displayTitle, type MediaPayload } from "./types";
import { isInlineTextDoc, resolveMediaKind } from "@/lib/media/kind";

/**
 * pdf.js is ~330KB gzipped plus its worker, so it loads only when a learner
 * actually opens a PDF. ssr:false because it touches window/canvas on import.
 */
const PdfViewer = dynamic(() => import("./pdf/pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-[14px] border-2 border-border bg-card">
      <span className="size-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
    </div>
  ),
});

/** Picks the right renderer for an item. One entry point for every surface. */
export function MediaViewer({
  payload,
  thumbUrl,
  autoPlay,
  compact,
  onWatchedFraction,
  onPageChange,
  onReachedEnd,
  onUnavailable,
}: {
  payload: MediaPayload;
  thumbUrl?: string | null;
  autoPlay?: boolean;
  compact?: boolean;
  /** Consumption callbacks for the lesson completion gate. Optional everywhere else. */
  onWatchedFraction?: (fraction: number) => void;
  onPageChange?: (page: number, total: number) => void;
  /** Fires when a non-paged, non-timed viewer has been read to the end. */
  onReachedEnd?: () => void;
  /** Fires when the chosen viewer cannot render the asset at all. */
  onUnavailable?: () => void;
}) {
  // Access is checked before kind: a locked item shows the paywall regardless
  // of what it is, and never receives a playback URL to begin with.
  if (payload.access.state !== "open" || !payload.playbackUrl) {
    return <LockedOverlay payload={payload} thumbUrl={thumbUrl} />;
  }

  // Resolved, not raw: an upload stored as OTHER because its Content-Type was
  // generic still opens in the right viewer. See resolveMediaKind.
  switch (resolveMediaKind(payload.item)) {
    case "VIDEO":
      return (
        <VideoPlayer
          payload={payload}
          autoPlay={autoPlay}
          compact={compact}
          onWatchedFraction={onWatchedFraction}
        />
      );
    case "AUDIO":
      return <AudioPlayer payload={payload} onWatchedFraction={onWatchedFraction} />;
    case "PDF":
      return <PdfViewer payload={payload} onPageChange={onPageChange} onUnavailable={onUnavailable} />;
    case "IMAGE":
      return <ImageLightbox src={payload.playbackUrl} alt={payload.item.description || displayTitle(payload.item)} />;
    default:
      // Text-shaped documents render in-page; Office formats and archives need
      // a conversion service we do not run, so those stay a download.
      if (isInlineTextDoc(payload.item)) {
        return <TextViewer payload={payload} onReachedEnd={onReachedEnd} />;
      }
      return <FileCard payload={payload} />;
  }
}

/**
 * Whether MediaViewer will render a real viewer for this item rather than a
 * download card. The lesson gate needs this: a card has nothing to watch,
 * page through or scroll, so gating on "consumed" would never be satisfiable.
 */
export function mediaRendersInline(item: {
  mediaKind: string;
  contentType?: string | null;
  name?: string | null;
}): boolean {
  const kind = resolveMediaKind(item);
  if (kind === "VIDEO" || kind === "AUDIO" || kind === "PDF" || kind === "IMAGE") return true;
  return isInlineTextDoc(item);
}
