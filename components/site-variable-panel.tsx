"use client";

import { useMemo, useState } from "react";
import { GROUP_LABELS, variablesForKind, type VariableDef } from "@/lib/site/variables";
import { Badge } from "@/components/ui/badge";
import { TextInput } from "@/components/form-field";
import { cn } from "@/lib/utils";
import type { VariableContext } from "@/lib/site/template";

/**
 * The searchable variable reference, shared by the page editor, the header and
 * footer editor, and the playground's left rail.
 *
 * Autocomplete only helps once you know a variable exists. This is the other
 * half: a list you can scan, showing what each one resolves to right now for
 * this tenant, so an author can tell the difference between "I typed it wrong"
 * and "we never filled that field in".
 *
 * It lists the variables that exist on THIS kind of page: a course page has
 * `course.*`, the home page does not, and showing both everywhere would send
 * authors to variables that resolve to nothing.
 */

function resolve(path: string, ctx: VariableContext | null): string {
  if (!ctx) return "";
  const parts = path.split(".");
  let cursor: unknown = ctx;
  for (const part of parts) {
    if (typeof cursor !== "object" || cursor === null) return "";
    cursor = (cursor as Record<string, unknown>)[part];
  }
  if (Array.isArray(cursor)) return `${cursor.length} ${cursor.length === 1 ? "item" : "items"}`;
  if (cursor === null || cursor === undefined) return "";
  if (typeof cursor === "object") return "";
  return String(cursor);
}

/**
 * What clicking a variable inserts. A list inserts its whole loop, already
 * shaped like something a visitor can use: the title as a link when the list
 * has links, then a couple of its other fields.
 */
export function snippetFor(v: VariableDef): string {
  if (v.kind !== "list") return `{{ ${v.path} }}`;
  const fields = v.fields ?? [];
  const hasUrl = fields.some((f) => f.name === "url");
  const title = fields.find((f) => f.name === "title" || f.name === "courseTitle") ?? fields[0];
  const rest = fields
    .filter((f) => f !== title && f.name !== "url" && f.name !== "current")
    .slice(0, 2);
  const heading = title
    ? hasUrl
      ? `  <p><a href="{{ this.url }}">{{ this.${title.name} }}</a></p>`
      : `  <p>{{ this.${title.name} }}</p>`
    : "";
  const body = [heading, ...rest.map((f) => `  <p>{{ this.${f.name} }}</p>`)]
    .filter(Boolean)
    .join("\n");
  return `{{#each ${v.path}}}\n${body}\n{{/each}}`;
}

export function SiteVariablePanel({
  context,
  onInsert,
  className,
  kind = "PAGE",
}: {
  context: VariableContext | null;
  onInsert?: (snippet: string) => void;
  className?: string;
  /** The kind of page being edited; decides which variables are listed. */
  kind?: string;
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const available = variablesForKind(kind);
    const q = query.trim().toLowerCase();
    const matched = q
      ? available.filter(
          (v) => v.path.toLowerCase().includes(q) || v.label.toLowerCase().includes(q)
        )
      : available;

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
  }, [query, kind]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <TextInput
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search variables…"
        aria-label="Search variables"
        autoComplete="off"
        spellCheck={false}
      />

      <div className="flex flex-col gap-4 overflow-y-auto">
        {groups.map(({ group, items }) => (
          <div key={group}>
            <h3 className="mb-1 text-[13px] font-bold text-foreground">
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
                        "w-full rounded-[10px] border-2 border-transparent px-2 py-1.5 text-left outline-none transition-colors [touch-action:manipulation]",
                        "focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring",
                        onInsert && "hover:border-border hover:bg-muted/50"
                      )}
                      title={onInsert ? "Insert at the cursor" : undefined}
                    >
                      <span className="flex flex-wrap items-center gap-1.5">
                        <code translate="no" className="break-all font-mono text-xs">
                          {v.kind === "list" ? `#each ${v.path}` : v.path}
                        </code>
                        {v.authOnly ? <Badge className="text-[10px]">signed in</Badge> : null}
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
