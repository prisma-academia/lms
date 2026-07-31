"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client/api";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/spinner";
import { Icon } from "@/components/icon";
import { MediaViewer } from "@/components/media/media-viewer";
import type { MediaPayload } from "@/components/media/types";
import { formatBytes, formatDuration, formatDimensions } from "@/lib/media/format";
import { MEDIA_KIND_LABEL } from "@/lib/media/kind";

/**
 * Admin preview of a library item.
 *
 * Reuses the learner-side <MediaViewer> rather than growing a second renderer:
 * what an admin most needs to check is that the file plays the way a learner
 * will see it, and a separate implementation would be the one place that drift
 * goes unnoticed.
 *
 * The payload is fetched per open and never cached — it carries a short-lived
 * signed URL, so a cached copy would go stale in the background and fail on the
 * next open with no obvious cause.
 */
export function PreviewDialog({
  itemId,
  onClose,
}: {
  itemId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!itemId} onOpenChange={(o) => !o && onClose()}>
      {itemId ? <PreviewBody key={itemId} itemId={itemId} /> : null}
    </Dialog>
  );
}

function PreviewBody({ itemId }: { itemId: string }) {
  const [payload, setPayload] = useState<MediaPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // No reset on entry: the dialog keys this body by item id, so a different
  // item is a different component instance that starts from fresh state.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await apiGet<MediaPayload>(`/api/tenant/library/${itemId}/preview`);
      if (cancelled) return;
      if (res.error || !res.data) setError(res.error?.message ?? "Could not load this file.");
      else setPayload(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const item = payload?.item;

  return (
    <DialogContent className="max-w-4xl">
      <DialogTitle className="truncate pr-10">
        {item ? item.title || item.name : "Preview"}
      </DialogTitle>
      {item ? (
        <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{MEDIA_KIND_LABEL[item.mediaKind]}</span>
          <span aria-hidden>·</span>
          <span className="num">{formatBytes(item.sizeBytes)}</span>
          {item.durationSeconds ? (
            <>
              <span aria-hidden>·</span>
              <span className="num">{formatDuration(item.durationSeconds)}</span>
            </>
          ) : null}
          {formatDimensions(item.width, item.height) ? (
            <>
              <span aria-hidden>·</span>
              <span className="num">{formatDimensions(item.width, item.height)}</span>
            </>
          ) : null}
          {item.folder ? <Badge>{item.folder.name}</Badge> : null}
        </DialogDescription>
      ) : (
        <DialogDescription>Loading the file…</DialogDescription>
      )}

      <div className="mt-4">
        {error ? (
          <div className="rounded-[12px] border-2 border-border bg-background p-6 text-center">
            <p className="text-sm font-bold text-destructive">{error}</p>
          </div>
        ) : !payload ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <MediaViewer payload={payload} thumbUrl={`/api/tenant/library/${itemId}/thumb`} />
        )}
      </div>

      {payload?.playbackUrl ? (
        <div className="mt-4 flex justify-end">
          <Button asChild variant="outline" size="sm">
            {/* The signed URL is already a download grant; download-ing it
                needs no extra endpoint. */}
            <a href={payload.playbackUrl} download={item?.name} target="_blank" rel="noreferrer">
              <Icon name="download" /> Download
            </a>
          </Button>
        </div>
      ) : null}
    </DialogContent>
  );
}
