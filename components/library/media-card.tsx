"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { formatBytes, formatDuration } from "@/lib/media/format";
import { MEDIA_KIND_ICON, MEDIA_KIND_LABEL, MEDIA_KIND_ACCENT } from "@/lib/media/kind";
import type { LibraryItemView } from "./types";

export function MediaThumb({ item, className }: { item: LibraryItemView; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = item.thumbUrl && !failed;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-[8px] border-2 border-border bg-background",
        className
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbUrl!}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span
          className="flex size-10 items-center justify-center rounded-[8px] border-2 border-border"
          style={{ background: MEDIA_KIND_ACCENT[item.mediaKind] }}
        >
          <Icon name={MEDIA_KIND_ICON[item.mediaKind]} className="size-5 text-foreground" />
        </span>
      )}
      {item.durationSeconds ? (
        <span className="num absolute bottom-1 right-1 rounded-[4px] bg-black/75 px-1 text-[10px] font-bold text-white">
          {formatDuration(item.durationSeconds)}
        </span>
      ) : null}
    </div>
  );
}

export function MediaCard({
  item,
  selected,
  selectionMode,
  onToggleSelect,
  onOpen,
}: {
  item: LibraryItemView;
  selected: boolean;
  selectionMode: boolean;
  onToggleSelect: (e: React.MouseEvent) => void;
  onOpen: () => void;
}) {
  const label = item.title || item.name;
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-[12px] border-2 border-border bg-card p-2 text-left shadow-sm transition-transform",
        "hover:-translate-x-px hover:-translate-y-px hover:shadow-md",
        selected && "outline outline-[3px] outline-offset-2 outline-ring"
      )}
    >
      {/* Checkbox sits above the open button so a click selects, not opens. */}
      <div
        className={cn(
          "absolute left-3 top-3 z-10 transition-opacity",
          selected || selectionMode ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        )}
      >
        <span onClick={onToggleSelect} role="presentation">
          <Checkbox checked={selected} aria-label={`Select ${label}`} />
        </span>
      </div>

      <button type="button" onClick={onOpen} className="flex flex-col gap-2 text-left outline-none">
        <MediaThumb item={item} className="aspect-[4/3] w-full" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold" title={label}>
            {label}
          </span>
          <span className="num mt-0.5 block text-xs text-muted-foreground">
            {MEDIA_KIND_LABEL[item.mediaKind]} · {formatBytes(item.sizeBytes)}
          </span>
        </span>
      </button>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {!item.isFree ? (
          <Badge color="var(--warning)">
            {item.priceCents != null
              ? `${item.currency ?? ""} ${(item.priceCents / 100).toFixed(2)}`.trim()
              : "Paid"}
          </Badge>
        ) : item.isPublic ? (
          <Badge color="var(--success)">Public</Badge>
        ) : (item._count?.grants ?? 0) > 0 ? (
          <Badge color="var(--info)">Assigned</Badge>
        ) : (
          <Badge color="var(--muted-foreground)">Private</Badge>
        )}
        {item.tags.slice(0, 2).map((t) => (
          <Badge key={t.tag.id}>{t.tag.name}</Badge>
        ))}
        {item.tags.length > 2 ? (
          <span className="num text-xs text-muted-foreground">+{item.tags.length - 2}</span>
        ) : null}
      </div>
    </div>
  );
}
