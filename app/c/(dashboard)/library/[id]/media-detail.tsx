"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client/api";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { Icon } from "@/components/icon";
import { MediaViewer } from "@/components/media/media-viewer";
import { displayTitle, type MediaPayload } from "@/components/media/types";
import { formatBytes, formatDuration } from "@/lib/media/format";
import { MEDIA_KIND_LABEL } from "@/lib/media/kind";

/**
 * Fetched client-side rather than on the server: the playback URL is signed
 * with a 15-minute TTL, and a server-rendered page can sit in a tab (or a
 * bfcache entry) long past that, leaving a dead player with no way to refresh.
 */
export function MediaDetail({ id }: { id: string }) {
  const [payload, setPayload] = useState<MediaPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await apiGet<MediaPayload>(`/api/client/library/${id}`);
      if (cancelled) return;
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Could not load this item.");
        return;
      }
      setPayload(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return <ErrorState title="Unavailable" message={error} onRetry={() => window.location.reload()} />;
  }
  if (!payload) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const { item } = payload;

  return (
    <div className="flex flex-col gap-4">
      <MediaViewer payload={payload} thumbUrl={`/api/client/library/${id}/thumb`} />

      <div>
        <h1 className="font-heading text-xl">{displayTitle(item)}</h1>
        <p className="num mt-1 text-sm text-muted-foreground">
          {MEDIA_KIND_LABEL[item.mediaKind]} · {formatBytes(item.sizeBytes)}
          {item.durationSeconds ? ` · ${formatDuration(item.durationSeconds)}` : ""}
          {item.folder ? ` · ${item.folder.name}` : ""}
        </p>
      </div>

      {item.description ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.description}</p>
      ) : null}

      {item.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.map((t) => (
            <Badge key={t.id}>{t.name}</Badge>
          ))}
        </div>
      ) : null}

      {payload.access.state === "open" && payload.access.canDownload && payload.playbackUrl ? (
        <a
          href={payload.playbackUrl}
          download={item.name}
          className="inline-flex w-fit items-center gap-1.5 rounded-[10px] border-2 border-border bg-card px-3 py-2 text-sm font-bold shadow-sm transition-transform hover:-translate-y-px active:translate-y-px"
        >
          <Icon name="download" className="size-4" /> Download
        </a>
      ) : null}
    </div>
  );
}
