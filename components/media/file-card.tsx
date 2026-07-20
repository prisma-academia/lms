"use client";

import { Icon } from "@/components/icon";
import { formatBytes } from "@/lib/media/format";
import { MEDIA_KIND_ICON, MEDIA_KIND_LABEL, MEDIA_KIND_ACCENT } from "@/lib/media/kind";
import { displayTitle, type MediaPayload } from "./types";

/** Fallback for anything without a dedicated renderer. */
export function FileCard({ payload }: { payload: MediaPayload }) {
  const { item, playbackUrl, access } = payload;
  const canDownload = access.state === "open" && access.canDownload;

  return (
    <div className="flex flex-col items-center gap-3 rounded-[14px] border-2 border-border bg-card p-8 text-center">
      <span
        className="flex size-16 items-center justify-center rounded-[12px] border-2 border-border"
        style={{ background: MEDIA_KIND_ACCENT[item.mediaKind] }}
      >
        <Icon name={MEDIA_KIND_ICON[item.mediaKind]} className="size-7 text-foreground" />
      </span>
      <div>
        <p className="font-heading text-base">{displayTitle(item)}</p>
        <p className="num mt-0.5 text-sm text-muted-foreground">
          {MEDIA_KIND_LABEL[item.mediaKind]} · {formatBytes(item.sizeBytes)}
        </p>
      </div>
      {playbackUrl && canDownload ? (
        <a
          href={playbackUrl}
          download={item.name}
          className="inline-flex items-center gap-1.5 rounded-[10px] border-2 border-border bg-primary px-3 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px active:translate-y-px"
        >
          <Icon name="download" className="size-4" /> Download
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">
          Preview isn&apos;t available for this file type.
        </p>
      )}
    </div>
  );
}
