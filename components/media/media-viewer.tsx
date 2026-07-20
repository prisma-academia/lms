"use client";

import dynamic from "next/dynamic";
import { VideoPlayer } from "./video/video-player";
import { AudioPlayer } from "./audio/audio-player";
import { ImageLightbox } from "./image/image-lightbox";
import { FileCard } from "./file-card";
import { LockedOverlay } from "./locked-overlay";
import { displayTitle, type MediaPayload } from "./types";

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
}: {
  payload: MediaPayload;
  thumbUrl?: string | null;
  autoPlay?: boolean;
  compact?: boolean;
}) {
  // Access is checked before kind: a locked item shows the paywall regardless
  // of what it is, and never receives a playback URL to begin with.
  if (payload.access.state !== "open" || !payload.playbackUrl) {
    return <LockedOverlay payload={payload} thumbUrl={thumbUrl} />;
  }

  switch (payload.item.mediaKind) {
    case "VIDEO":
      return <VideoPlayer payload={payload} autoPlay={autoPlay} compact={compact} />;
    case "AUDIO":
      return <AudioPlayer payload={payload} />;
    case "PDF":
      return <PdfViewer payload={payload} />;
    case "IMAGE":
      return <ImageLightbox src={payload.playbackUrl} alt={payload.item.description || displayTitle(payload.item)} />;
    default:
      return <FileCard payload={payload} />;
  }
}
