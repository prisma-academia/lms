"use client";

import { useMemo, useState } from "react";
import { GROUP_LABELS, SITE_VARIABLES, type VariableDef } from "@/lib/site/variables";
import { Badge } from "@/components/ui/badge";
import { TextInput } from "@/components/form-field";
import { cn } from "@/lib/utils";
import type { VariableContext } from "@/lib/site/template";

/**
 * The searchable variable reference, shared by the page editor and the
 * playground's left rail.
 *
 * Autocomplete only helps once you know a variable exists. This is the other
 * half: a list you can scan, showing what each one resolves to right now for
 * this tenant, so an author can tell the difference between "I typed it wrong"
 * and "we never filled that field in".
 */

function resolve(path: string, ctx: VariableContext | null): string {
  if (!ctx) return "";
  const parts = path.split(".");
  let cursor: unknown = ctx;
  for (const part of parts) {
    if (typeof cursor !== "object" || cursor === null) return "";
    cursor = (cursor as Record<string, unknown>)[part];
  }
  if (Array.isArray(cursor)) return `${cursor.length} items`;
  if (cursor === null || cursor === undefined) return "";
  if (typeof cursor === "object") return "";
  return String(cursor);
}

/** What clicking a variable inserts. Lists insert their whole loop. */
export function snippetFor(v: VariableDef): string {
  if (v.kind !== "list") return `{{ ${v.path} }}`;
  const fields = (v.fields ?? []).slice(0, 3);
  const body = fields.map((f) => `  <p>{{ this.${f.name} }}</p>`).join("\n");
  return `{{#each ${v.path}}}\n${body}\n{{/each}}`;
}

export function SiteVariablePanel({
  context,
  onInsert,
  className,
}: {
  context: VariableContext | null;
  onInsert?: (snippet: string) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? SITE_VARIABLES.filter(
          (v) => v.path.toLowerCase().includes(q) || v.label.toLowerCase().includes(q)
        )
      : SITE_VARIABLES;

    const order: string[] = [];
    const byGroup = new Map<string, VariableDef[]>();
    for (const v of matched) {
      const group = v.path.includes(".") ? v.path.split(".")[0] : v.path;
      if (!byGroup.has(group)) {
        byGroup.set(group, []);
        order.push(group);
      }
      byGroup.get(group)!.push(v);
    }
    return order.map((group) => ({ group, items: byGroup.get(group)! }));
  }, [query]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <TextInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search variables…"
        aria-label="Search variables"
      />

      <div className="flex flex-col gap-4 overflow-y-auto">
        {groups.map(({ group, items }) => (
          <div key={group}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {GROUP_LABELS[group] ?? group}
            </h3>
            <ul className="flex flex-col gap-1">
              {items.map((v) => {
                const value = resolve(v.path, context);
                return (
                  <li key={v.path}>
                    <button
                      type="button"
                      onClick={() => onInsert?.(snippetFor(v))}
                      disabled={!onInsert}
                      className={cn(
                        "w-full rounded-[10px] border-2 border-transparent px-2 py-1.5 text-left transition",
                        onInsert && "hover:border-border hover:bg-muted/50"
                      )}
                      title={onInsert ? "Insert at cursor" : undefined}
                    >
                      <span className="flex flex-wrap items-center gap-1.5">
                        <code className="font-mono text-xs">
                          {v.kind === "list" ? `#each ${v.path}` : v.path}
                        </code>
                        {v.authOnly ? (
                          <Badge className="text-[10px]">signed in</Badge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {v.label}
                        {value ? ` — ${value}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No variables match “{query}”.</p>
        ) : null}
      </div>
    </div>
  );
}
