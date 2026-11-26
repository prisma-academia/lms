"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icon";
import type { ScopedHtml } from "@/lib/content/sanitize-html";
import { ScaledCertificate } from "./certificate-preview";

/** A built-in design, ready to show: its source, and that source rendered. */
export type GalleryTemplate = {
  id: string;
  name: string;
  description: string;
  /** The certificate source this design puts in the editor. */
  html: string;
  /** Rendered on the server through the real certificate pipeline. */
  preview: ScopedHtml;
};

/**
 * The built-in certificate designs, as pictures.
 *
 * Each thumbnail is the design itself, rendered with the academy's own name,
 * logo and accent colour — not a screenshot — so what is chosen here is what
 * arrives in the editor.
 */
export function TemplateGallery({
  templates,
  currentSource,
  onUse,
  canWrite,
}: {
  templates: GalleryTemplate[];
  /** What is in the editor now, to mark the design it came from. */
  currentSource: string;
  onUse: (template: GalleryTemplate) => void;
  canWrite: boolean;
}) {
  const uid = useId();
  const current = currentSource.trim();
  const inUse = templates.find((t) => t.html.trim() === current)?.id ?? null;
  // Open while the certificate is still an untouched starter (or empty): that
  // is when someone is choosing. Once they have made it their own, it folds
  // away rather than sitting above their work.
  const [open, setOpen] = useState(() => inUse !== null || current === "");

  return (
    <section aria-labelledby={`${uid}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${uid}-title`} className="text-base font-bold text-foreground">
            Designs
          </h2>
          <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
            Shown with your name, logo and accent colour. Choosing one replaces the HTML below — you
            can undo it.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls={`${uid}-list`}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? "chevron-up" : "chevron-down"} aria-hidden />
          {open ? "Hide designs" : `Browse ${templates.length} designs`}
        </Button>
      </div>

      <ul
        id={`${uid}-list`}
        hidden={!open}
        className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
      >
        {templates.map((template) => {
          const active = template.id === inUse;
          return (
            <li
              key={template.id}
              className="flex flex-col gap-2.5 rounded-[12px] border-2 border-border bg-background p-2.5"
            >
              <ScaledCertificate
                preview={template.preview}
                label={`The ${template.name} design, shown with sample details`}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1 px-0.5">
                <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
                  {template.name}
                  {active ? <Badge color="var(--success)">In the editor</Badge> : null}
                </h3>
                <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                  {template.description}
                </p>
              </div>
              {canWrite ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={active}
                  onClick={() => onUse(template)}
                >
                  {active ? "In use" : "Use this design"}
                  <span className="sr-only">: {template.name}</span>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
