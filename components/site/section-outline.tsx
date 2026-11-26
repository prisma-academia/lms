"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  deleteSection,
  duplicateSection,
  insertSection,
  listSections,
  moveSection,
} from "@/lib/site/section-tools";
import { sectionLibrary, sectionWithStyles } from "@/lib/site/html-sections";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

/**
 * The page as a list of its sections: move one up or down, copy it, remove
 * it, or add a ready-made one.
 *
 * Everything here edits the HTML source as text (see lib/site/section-tools.ts)
 * and hands the result back through `onChange`. Nothing is reformatted, and
 * each action reaches the code editor as a single change — so one Ctrl+Z in
 * the editor takes it back.
 */

const SELECT_CLASS =
  "h-9 min-w-0 flex-1 rounded-[8px] border-2 border-border bg-card px-2 text-[13px] font-medium text-card-foreground outline-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50";

const ICON_BUTTON =
  "flex size-8 shrink-0 items-center justify-center rounded-[8px] border-2 border-border bg-card text-sm font-bold text-card-foreground outline-none [touch-action:manipulation] hover:bg-muted focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40";

export function SectionOutline({
  source,
  onChange,
  canWrite,
  className,
}: {
  source: string;
  /** Receives the whole new document. One call per action. */
  onChange: (next: string) => void;
  canWrite: boolean;
  className?: string;
}) {
  const uid = useId();
  const confirm = useConfirm();
  const sections = useMemo(() => listSections(source), [source]);
  const library = useMemo(() => sectionLibrary(), []);
  const [pick, setPick] = useState(library[0]?.id ?? "");
  const [where, setWhere] = useState("end");
  const liveRef = useRef<HTMLParagraphElement>(null);

  function announce(message: string) {
    if (liveRef.current) liveRef.current.textContent = message;
  }

  function move(index: number, direction: -1 | 1) {
    const section = sections[index];
    const next = moveSection(source, index, direction);
    if (next === source) return;
    onChange(next);
    announce(`Moved “${section.label}” ${direction === -1 ? "up" : "down"}.`);
  }

  function duplicate(index: number) {
    onChange(duplicateSection(source, index));
    announce(`Copied “${sections[index].label}”. The copy is directly below it.`);
  }

  async function remove(index: number) {
    const section = sections[index];
    const ok = await confirm({
      title: "Delete this section?",
      description: `“${section.label}” is removed from the page. You can bring it back with Undo (Ctrl+Z) in the editor, and nothing is saved until you press Save.`,
      confirmLabel: "Delete section",
      destructive: true,
    });
    if (!ok) return;
    onChange(deleteSection(source, index));
    announce(`Deleted “${section.label}”.`);
  }

  function insert() {
    const snippet = library.find((s) => s.id === pick);
    if (!snippet) return;
    const after = where === "end" ? null : where === "start" ? -1 : Number(where);
    // The ready-made sections share one stylesheet; bring it along if the page
    // does not have it yet, so the section does not arrive unstyled.
    const markup = sectionWithStyles(source, snippet.html);
    onChange(insertSection(source, after, markup));
    announce(`Added “${snippet.name}”.`);
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <p ref={liveRef} aria-live="polite" className="sr-only" />

      {sections.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          This page has no sections yet. Add one below, or start typing in the editor.
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {sections.map((section, index) => (
            <li
              key={`${section.start}-${section.end}`}
              className="flex items-center gap-1.5 rounded-[10px] border-2 border-border bg-background p-1.5"
            >
              <span className="min-w-0 flex-1 px-1">
                <span className="block truncate text-[13px] font-bold text-foreground">{section.label}</span>
                <code translate="no" className="block truncate font-mono text-[11px] text-muted-foreground">
                  {section.tag === "block" ? "{{ … }}" : `<${section.tag}>`}
                </code>
              </span>
              {canWrite ? (
                <>
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move “${section.label}” up`}
                  >
                    <span aria-hidden>↑</span>
                  </button>
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    onClick={() => move(index, 1)}
                    disabled={index === sections.length - 1}
                    aria-label={`Move “${section.label}” down`}
                  >
                    <span aria-hidden>↓</span>
                  </button>
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    onClick={() => duplicate(index)}
                    aria-label={`Duplicate “${section.label}”`}
                  >
                    <Icon name="layers" className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    onClick={() => void remove(index)}
                    aria-label={`Delete “${section.label}”`}
                  >
                    <Icon name="trash" className="size-3.5" aria-hidden />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {canWrite ? (
        <div className="flex flex-col gap-2 rounded-[10px] border-2 border-dashed border-border p-2.5">
          <p className="text-[13px] font-bold text-foreground">Insert a section</p>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${uid}-what`} className="sr-only">
              Section to insert
            </label>
            <select
              id={`${uid}-what`}
              className={SELECT_CLASS}
              value={pick}
              onChange={(e) => setPick(e.target.value)}
            >
              {library.map((snippet) => (
                <option key={snippet.id} value={snippet.id}>
                  {snippet.name}
                </option>
              ))}
            </select>
            <label htmlFor={`${uid}-where`} className="sr-only">
              Where to insert it
            </label>
            <select
              id={`${uid}-where`}
              className={SELECT_CLASS}
              value={where}
              onChange={(e) => setWhere(e.target.value)}
            >
              <option value="end">At the end of the page</option>
              {sections.length > 0 ? <option value="start">At the top of the page</option> : null}
              {sections.map((section, index) => (
                <option key={`${section.start}-${index}`} value={String(index)}>
                  After “{section.label}”
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {library.find((s) => s.id === pick)?.description}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={insert}>
            <Icon name="plus" aria-hidden />
            Insert section
          </Button>
        </div>
      ) : null}
    </div>
  );
}
