"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { templatesForKind } from "@/lib/site/page-templates";
import { kindStarter } from "@/lib/site/kind-starters";
import { previewDocument } from "@/lib/site/preview-document";
import type { SavedSiteTemplate } from "@/lib/site/saved-templates";
import type { SitePageKind } from "@/lib/site/site-api";
import type { VariableContext } from "@/lib/site/template";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The designs a page of one kind can start from, each shown as it will look.
 *
 * Thumbnails are not screenshots. Each one is the design itself, put through
 * the same steps as a live page (variables filled in, then sanitized for this
 * kind of page) and drawn in a sandboxed frame at desktop width, scaled down.
 * So a thumbnail shows the academy's own name and courses, and can never show
 * something the real page would not.
 *
 * They are built lazily: a frame is only created once its card scrolls near
 * the viewport, so a gallery of twenty designs does not render twenty pages at
 * once.
 */

export type TemplateChoice = {
  /** Unique within the gallery. */
  key: string;
  name: string;
  description: string;
  html: string;
  origin: "standard" | "builtin" | "saved";
  /** Built-in designs: the registry id, which the pages API also accepts. */
  templateId?: string;
  /** Saved designs: the row id. */
  savedId?: string;
};

const FRAME_WIDTH = 1200;
const FRAME_HEIGHT = 825;

function Thumbnail({
  html,
  kind,
  context,
  onClick,
}: {
  html: string;
  kind: SitePageKind;
  context: VariableContext | null;
  onClick?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          seen.disconnect();
        }
      },
      { rootMargin: "240px" }
    );
    seen.observe(host);
    const sized = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setScale(width / FRAME_WIDTH);
    });
    sized.observe(host);
    return () => {
      seen.disconnect();
      sized.disconnect();
    };
  }, []);

  const srcDoc = useMemo(
    () => (near && context ? previewDocument({ source: html, kind }, context).srcDoc : null),
    [near, context, html, kind]
  );

  return (
    // Decorative: the card's name and description say what the design is, and
    // its button is how it is chosen. Clicking the picture is a mouse shortcut.
    <div
      ref={hostRef}
      aria-hidden
      onClick={onClick}
      className={cn(
        "relative aspect-[16/11] overflow-hidden rounded-[10px] border-2 border-border bg-white",
        onClick && "cursor-pointer"
      )}
    >
      {srcDoc ? (
        <iframe
          sandbox=""
          tabIndex={-1}
          srcDoc={srcDoc}
          title=""
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${scale})` }}
        />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-muted" />
      )}
    </div>
  );
}

/** Every design on offer for a page of this kind, in gallery order. */
export function templateChoices(kind: SitePageKind, saved: SavedSiteTemplate[]): TemplateChoice[] {
  const choices: TemplateChoice[] = [];
  if (kind !== "PAGE") {
    choices.push({
      key: "standard",
      name: "Plain starter",
      description: "A plain, working page with everything this screen needs. Restyle it as you like.",
      html: kindStarter(kind).html,
      origin: "standard",
    });
  }
  for (const t of templatesForKind(kind)) {
    choices.push({
      key: `builtin:${t.id}`,
      name: t.name,
      description: t.description,
      html: t.html(),
      origin: "builtin",
      templateId: t.id,
    });
  }
  for (const s of saved.filter((row) => row.kind === kind)) {
    choices.push({
      key: `saved:${s.id}`,
      name: s.name,
      description: "Saved from one of your own pages.",
      html: s.htmlSource,
      origin: "saved",
      savedId: s.id,
    });
  }
  return choices;
}

export function TemplateGallery({
  kind,
  context,
  saved,
  selectedKey,
  onChoose,
  chooseLabel = "Use this design",
  onDeleteSaved,
  disabled = false,
  className,
}: {
  kind: SitePageKind;
  /** Values for the thumbnails' variables; thumbnails wait until it arrives. */
  context: VariableContext | null;
  saved: SavedSiteTemplate[];
  /** When set, the gallery is a picker: the chosen card is marked. */
  selectedKey?: string | null;
  onChoose: (choice: TemplateChoice) => void;
  chooseLabel?: string;
  /** Offered on saved designs when given. */
  onDeleteSaved?: (choice: TemplateChoice) => void;
  disabled?: boolean;
  className?: string;
}) {
  const choices = useMemo(() => templateChoices(kind, saved), [kind, saved]);
  const builtIn = choices.filter((c) => c.origin !== "saved");
  const own = choices.filter((c) => c.origin === "saved");
  const picking = selectedKey !== undefined;

  const grid = (items: TemplateChoice[]) => (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((choice) => {
        const selected = picking && selectedKey === choice.key;
        return (
          <li
            key={choice.key}
            className={cn(
              "flex flex-col gap-2 rounded-[14px] border-2 bg-card p-3",
              selected ? "border-primary shadow-md" : "border-border"
            )}
          >
            <Thumbnail
              html={choice.html}
              kind={kind}
              context={context}
              onClick={disabled ? undefined : () => onChoose(choice)}
            />
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-bold text-foreground">{choice.name}</h4>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{choice.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                aria-pressed={picking ? selected : undefined}
                disabled={disabled}
                onClick={() => onChoose(choice)}
                aria-label={`${selected ? "Selected" : chooseLabel}: ${choice.name}`}
              >
                {selected ? "Selected" : chooseLabel}
              </Button>
              {choice.origin === "saved" && onDeleteSaved ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onDeleteSaved(choice)}
                  aria-label={`Delete the saved design ${choice.name}`}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {builtIn.length > 0 ? grid(builtIn) : null}
      {own.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-bold text-foreground">Your saved designs</h3>
          {grid(own)}
        </div>
      ) : null}
      {choices.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no designs for this kind of page yet.</p>
      ) : null}
    </div>
  );
}
