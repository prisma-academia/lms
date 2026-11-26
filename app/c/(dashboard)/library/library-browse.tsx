"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/client/api";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";
import { TextInput, SelectInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { formatDuration, formatBytes } from "@/lib/media/format";
import { ALL_MEDIA_KINDS, MEDIA_KIND_LABEL, MEDIA_KIND_ICON, MEDIA_KIND_ACCENT } from "@/lib/media/kind";
import { formatPrice } from "@/lib/site/public-format";
import type { MediaKind } from "@/lib/generated/prisma/enums";

type Row = {
  id: string;
  name: string;
  title: string | null;
  mediaKind: MediaKind;
  sizeBytes: number;
  durationSeconds: number | null;
  folder: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
  isFree: boolean;
  priceCents: number | null;
  currency: string | null;
  thumbUrl: string | null;
  progress: { positionSeconds: number; completed: boolean; percent: number } | null;
};

const PAGE = 24;

export function LibraryBrowse({
  tags,
  locale,
}: {
  tags: { id: string; name: string }[];
  /** The academy's locale, for prices. Items load in the browser, so it comes down with the page. */
  locale?: string;
}) {
  const [items, setItems] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (after: string | null) => {
      setLoading(true);
      const sp = new URLSearchParams();
      sp.set("take", String(PAGE));
      if (q.trim()) sp.set("q", q.trim());
      if (kind !== "all") sp.set("kind", kind);
      activeTags.forEach((t) => sp.append("tagId", t));
      if (after) sp.set("cursor", after);

      const res = await apiGet<Row[]>(`/api/client/library?${sp.toString()}`);
      setLoading(false);
      if (res.error) {
        // Say so, and stop asking for more pages: a failed load used to look
        // exactly like an empty library.
        setError(res.error.message);
        setDone(true);
        return;
      }
      setError(null);
      const rows = res.data ?? [];
      setItems((prev) => (after ? [...prev, ...rows] : rows));
      setCursor(rows.length === PAGE ? rows[rows.length - 1].id : null);
      setDone(rows.length < PAGE);
    },
    [q, kind, activeTags]
  );

  // Debounced reload on filter change.
  useEffect(() => {
    const t = setTimeout(() => void load(null), 250);
    return () => clearTimeout(t);
  }, [load]);

  // Learners scroll rather than paginate.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || loading || !cursor) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) void load(cursor);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, done, loading, load]);

  const filtering = Boolean(q.trim()) || kind !== "all" || activeTags.length > 0;

  function clearFilters() {
    setQ("");
    setKind("all");
    setActiveTags([]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="search" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Icon
            name="search"
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <TextInput
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the library…"
            aria-label="Search the library"
            autoComplete="off"
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-40">
          <SelectInput
            aria-label="Filter by type"
            value={kind}
            allowEmpty={false}
            onChange={(e) => setKind(e.target.value)}
            options={[{ value: "all", label: "All types" }, ...ALL_MEDIA_KINDS.map((k) => ({ value: k, label: MEDIA_KIND_LABEL[k] }))]}
          />
        </div>
      </div>

      {tags.length > 0 ? (
        <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const on = activeTags.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => setActiveTags((prev) => (on ? prev.filter((x) => x !== t.id) : [...prev, t.id]))}
                className={`inline-flex min-h-9 items-center gap-1 rounded-full border-2 border-border px-3 text-xs font-bold outline-none [touch-action:manipulation] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  on ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground hover:bg-muted"
                }`}
              >
                {/* A tick as well as the fill, so "on" is not colour alone. */}
                {on ? <Icon name="check" aria-hidden className="size-3" /> : null}
                {t.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {error && items.length === 0 ? (
        <div role="alert" className="rounded-[14px] border-2 border-border bg-card p-5 shadow-md">
          <p className="text-sm font-bold text-destructive">We couldn&rsquo;t load the library.</p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-3" onClick={() => void load(null)}>
            Try again
          </Button>
        </div>
      ) : loading && items.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner label="Loading the library…" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="layers"
          title={filtering ? "Nothing matches those filters" : "Nothing here yet"}
          action={
            filtering ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        >
          {filtering
            ? "Try a different word, type or tag."
            : "Videos, documents and recordings your instructors share with you will appear here."}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const name = item.title || item.name;
            return (
              <li key={item.id} className="min-w-0">
                <Link
                  href={`/library/${item.id}`}
                  className="group flex h-full flex-col rounded-[12px] border-2 border-border bg-card p-2 shadow-sm outline-none transition-transform [touch-action:manipulation] hover:-translate-x-px hover:-translate-y-px hover:shadow-md focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[8px] border-2 border-border bg-background">
                    {item.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted thumbnail of unknown size
                      <img
                        src={item.thumbUrl}
                        alt=""
                        width={320}
                        height={240}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="flex size-10 items-center justify-center rounded-[8px] border-2 border-border"
                        style={{ background: MEDIA_KIND_ACCENT[item.mediaKind] }}
                      >
                        <Icon name={MEDIA_KIND_ICON[item.mediaKind]} className="size-5 text-foreground" />
                      </span>
                    )}
                    {/* These three sit on top of a picture of unknown colours, so
                        they carry their own dark scrim and white text rather
                        than theme tokens, which could vanish against it. */}
                    {item.durationSeconds ? (
                      <span className="num absolute bottom-1 right-1 rounded-[4px] bg-black/75 px-1 text-[10px] font-bold text-white">
                        {formatDuration(item.durationSeconds)}
                      </span>
                    ) : null}
                    {!item.isFree ? (
                      <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded-[4px] bg-black/75 px-1 py-0.5 text-[10px] font-bold text-white">
                        <Icon name="lock" aria-hidden className="size-3" />
                        <span className="sr-only">Paid: </span>
                        {item.priceCents != null && item.currency
                          ? formatPrice(item.priceCents, item.currency, locale)
                          : "Paid"}
                      </span>
                    ) : null}
                    {/* Resume ribbon: where they left off, at a glance. */}
                    {item.progress && item.progress.percent > 0 ? (
                      <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-white/30">
                        <span className="block h-full" style={{ width: `${item.progress.percent}%`, background: "var(--primary)" }} />
                      </span>
                    ) : null}
                  </div>

                  <span className="mt-2 line-clamp-2 break-words text-sm font-bold" title={name}>
                    {name}
                  </span>
                  <span className="num mt-0.5 block text-xs font-medium text-muted-foreground">
                    {MEDIA_KIND_LABEL[item.mediaKind]} · {formatBytes(item.sizeBytes)}
                    {item.progress && item.progress.percent > 0
                      ? ` · ${item.progress.completed ? "finished" : `${Math.round(item.progress.percent)}% through`}`
                      : ""}
                  </span>
                  {item.tags.length > 0 ? (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {item.tags.slice(0, 2).map((t) => (
                        <Badge key={t.id}>{t.name}</Badge>
                      ))}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div ref={sentinel} aria-hidden className="h-4" />
      {loading && items.length > 0 ? (
        <div className="flex justify-center py-2">
          <Spinner label="Loading more…" />
        </div>
      ) : null}
    </div>
  );
}
