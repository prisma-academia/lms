"use client";

import { useEffect, useMemo, useState } from "react";
import type { VariableContext } from "@/lib/site/template";
import { previewDocument } from "@/lib/site/preview-document";
import type { SitePageKind } from "@/lib/site/site-api";
import { cn } from "@/lib/utils";

/**
 * The as-you-type preview for a site document.
 *
 * It runs the same two steps the server does — fill in the variables, then
 * sanitize for this kind of page (see lib/site/preview-document.ts) — so the
 * preview is what a visitor will get, not what was typed: a `<script>`, or a
 * sign-in form on a page that may not have one, is already gone here.
 *
 * Rendered into `<iframe sandbox="">` — an empty sandbox, with neither
 * `allow-scripts` nor `allow-same-origin`. The sanitizer is one lock; this is
 * the other. Nothing in the frame can run, submit a form, or reach the admin
 * page around it.
 *
 * What it does not show is the application around the page: the built-in
 * header and footer, and the visitor's theme. The header and footer appear
 * when their markup is passed in; the saved preview shows the rest.
 */

const DEVICE_WIDTHS = { desktop: null, tablet: 820, mobile: 390 } as const;
export type PreviewDevice = keyof typeof DEVICE_WIDTHS;

export function SiteLivePreview({
  source,
  context,
  kind = "PAGE",
  header,
  footer,
  sharedCss,
  device = "desktop",
  height = 620,
  className,
  title = "Live preview",
  /** Debounce in ms. Long enough to not re-render mid-word. */
  delay = 300,
}: {
  source: string;
  context: VariableContext | null;
  /** What kind of page this is: decides which forms survive. */
  kind?: SitePageKind;
  /** The site's own header and footer, to show the page inside them. */
  header?: string | null;
  footer?: string | null;
  sharedCss?: string | null;
  device?: PreviewDevice;
  height?: number;
  className?: string;
  title?: string;
  delay?: number;
}) {
  const [debounced, setDebounced] = useState({ source, header, footer, sharedCss });

  useEffect(() => {
    const t = setTimeout(() => setDebounced({ source, header, footer, sharedCss }), delay);
    return () => clearTimeout(t);
  }, [source, header, footer, sharedCss, delay]);

  const srcDoc = useMemo(
    () => previewDocument({ ...debounced, kind }, context).srcDoc,
    [debounced, kind, context]
  );

  const width = DEVICE_WIDTHS[device];

  return (
    <div
      className={cn(
        "flex justify-center overflow-auto rounded-[14px] border-2 border-border bg-muted/30 p-3",
        className
      )}
      style={{ height }}
    >
      <iframe
        // An empty sandbox is a security boundary here. Do not add
        // allow-scripts, allow-forms or allow-same-origin.
        sandbox=""
        srcDoc={srcDoc}
        title={title}
        className="h-full rounded-[10px] border border-border bg-white"
        style={{ width: width ? `${width}px` : "100%", maxWidth: "100%" }}
      />
    </div>
  );
}
