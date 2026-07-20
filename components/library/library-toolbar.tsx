"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { TextInput, SelectInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { ALL_MEDIA_KINDS, MEDIA_KIND_LABEL } from "@/lib/media/kind";
import type { SortKey, LibraryTagRef } from "./types";

export function LibraryToolbar({
  q,
  onQChange,
  kind,
  onKindChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  tags,
  activeTagIds,
  onToggleTag,
  onClearFilters,
  hasFilters,
}: {
  q: string;
  onQChange: (v: string) => void;
  kind: string;
  onKindChange: (v: string) => void;
  sort: SortKey;
  onSortChange: (v: SortKey) => void;
  view: "grid" | "list";
  onViewChange: (v: "grid" | "list") => void;
  tags: LibraryTagRef[];
  activeTagIds: string[];
  onToggleTag: (id: string) => void;
  onClearFilters: () => void;
  hasFilters: boolean;
}) {
  // Local mirror so typing stays responsive while the URL updates on a debounce.
  const [draft, setDraft] = useState(q);
  // Re-sync when `q` changes from outside (Clear filters, back button) using
  // the adjust-state-during-render pattern rather than an effect: an effect
  // would render once with the stale value before correcting it.
  const [lastQ, setLastQ] = useState(q);
  if (lastQ !== q) {
    setLastQ(q);
    setDraft(q);
  }
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft !== q) onQChange(draft);
    }, 250);
    return () => clearTimeout(t);
  }, [draft, q, onQChange]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <TextInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search the library…"
            aria-label="Search the library"
            className="pl-9"
          />
        </div>

        <div className="w-40">
          <SelectInput
            aria-label="Filter by type"
            value={kind}
            onChange={(e) => onKindChange(e.target.value)}
            options={[
              { value: "all", label: "All types" },
              ...ALL_MEDIA_KINDS.map((k) => ({ value: k, label: MEDIA_KIND_LABEL[k] })),
            ]}
          />
        </div>

        <div className="w-40">
          <SelectInput
            aria-label="Sort"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            options={[
              { value: "recent", label: "Newest first" },
              { value: "name", label: "Name" },
              { value: "size", label: "Largest first" },
              { value: "type", label: "Type" },
            ]}
          />
        </div>

        <Segmented
          ariaLabel="View"
          value={view}
          onChange={onViewChange}
          options={[
            { value: "grid", label: "Grid" },
            { value: "list", label: "List" },
          ]}
        />
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => {
            const on = activeTagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => onToggleTag(t.id)}
                className={`rounded-full border-2 border-border px-2.5 py-0.5 text-xs font-bold transition-transform hover:-translate-y-px ${
                  on ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"
                }`}
              >
                {t.name}
              </button>
            );
          })}
          {hasFilters ? (
            <Button type="button" size="xs" variant="ghost" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
