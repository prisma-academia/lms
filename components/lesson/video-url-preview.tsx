"use client";

import { parseVideoUrl, VIDEO_URL_HELP } from "@/lib/media/video-embed";

/**
 * Immediate feedback under a video link field.
 *
 * The server rejects an unplayable link, but a save-time error means the author
 * has already moved on. Showing what we recognised — provider, thumbnail, start
 * offset — turns a paste into something they can confirm at a glance, and turns
 * a typo into a correction made while they are still looking at the field.
 */
export function VideoUrlPreview({ url }: { url: string }) {
  const trimmed = url.trim();
  if (!trimmed) {
    return <p className="text-xs text-muted-foreground">{VIDEO_URL_HELP}</p>;
  }

  const embed = parseVideoUrl(trimmed);
  if (!embed) {
    return (
      <p className="text-xs font-semibold text-destructive">
        This link cannot be played, so the lesson would never be completable. {VIDEO_URL_HELP}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      {embed.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote provider thumbnail, no loader configured
        <img
          src={embed.thumbnailUrl}
          alt=""
          className="h-10 w-[71px] shrink-0 rounded border-2 border-border object-cover"
        />
      ) : null}
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{embed.label}</span>
        {embed.startSeconds > 0 ? ` · starts at ${embed.startSeconds}s` : ""}
        {embed.hasProgressSignal
          ? " · playback is tracked, so watching it can unlock completion"
          : " · playback cannot be tracked here, so completion falls back to the on-page timer"}
      </p>
    </div>
  );
}
