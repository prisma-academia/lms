"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/client/api";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/spinner";
import { TextInput, SelectInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { formatDuration, formatBytes } from "@/lib/media/format";
import { ALL_MEDIA_KINDS, MEDIA_KIND_LABEL, MEDIA_KIND_ICON, MEDIA_KIND_ACCENT } from "@/lib/media/kind";
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

export function LibraryBrowse({ tags }: { tags: { id: string; name: string }[] }) {
  const [items, setItems] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search the library" className="pl-9" />
        </div>
        <div className="w-36">
          <SelectInput
            aria-label="Filter by type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            options={[{ value: "all", label: "All types" }, ...ALL_MEDIA_KINDS.map((k) => ({ value: k, label: MEDIA_KIND_LABEL[k] }))]}
          />
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = activeTags.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => setActiveTags((prev) => (on ? prev.filter((x) => x !== t.id) : [...prev, t.id]))}
                className={`rounded-full border-2 border-border px-2.5 py-0.5 text-xs font-bold ${
                  on ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"
                }`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon="layers" title="Nothing here yet">
          {q || kind !== "all" || activeTags.length > 0
            ? "Try a different search or filter."
            : "When your instructor shares media with you, it appears here."}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/library/${item.id}`}
              className="group flex flex-col rounded-[12px] border-2 border-border bg-card p-2 shadow-sm transition-transform hover:-translate-x-px hover:-translate-y-px hover:shadow-md"
            >
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[8px] border-2 border-border bg-background">
                {item.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <span className="flex size-10 items-center justify-center rounded-[8px] border-2 border-border" style={{ background: MEDIA_KIND_ACCENT[item.mediaKind] }}>
                    <Icon name={MEDIA_KIND_ICON[item.mediaKind]} className="size-5 text-foreground" />
                  </span>
                )}
                {item.durationSeconds ? (
                  <span className="num absolute bottom-1 right-1 rounded-[4px] bg-black/75 px-1 text-[10px] font-bold text-white">
                    {formatDuration(item.durationSeconds)}
                  </span>
                ) : null}
                {!item.isFree ? (
                  <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded-[4px] bg-black/75 px-1 py-0.5 text-[10px] font-bold text-white">
                    <Icon name="lock" className="size-3" />
                    {item.priceCents != null ? `${item.currency ?? ""} ${(item.priceCents / 100).toFixed(0)}` : ""}
                  </span>
                ) : null}
                {/* Resume ribbon: where they left off, at a glance. */}
                {item.progress && item.progress.percent > 0 ? (
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-white/30">
                    <span className="block h-full" style={{ width: `${item.progress.percent}%`, background: "var(--primary)" }} />
                  </span>
                ) : null}
              </div>

              <span className="mt-2 block truncate text-sm font-bold" title={item.title || item.name}>
                {item.title || item.name}
              </span>
              <span className="num mt-0.5 block text-xs text-muted-foreground">
                {MEDIA_KIND_LABEL[item.mediaKind]} · {formatBytes(item.sizeBytes)}
              </span>
              {item.tags.length > 0 ? (
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {item.tags.slice(0, 2).map((t) => (
                    <Badge key={t.id}>{t.name}</Badge>
                  ))}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      )}

      <div ref={sentinel} className="h-4" />
      {loading && items.length > 0 ? (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      ) : null}
    </div>
  );
}
