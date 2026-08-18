"use client";

import { useEffect, useMemo, useState } from "react";
import { renderTemplate, type VariableContext } from "@/lib/site/template";
import { cn } from "@/lib/utils";

/**
 * The as-you-type preview for a site page.
 *
 * Rendered into `<iframe sandbox="">` — an empty sandbox, with neither
 * `allow-scripts` nor `allow-same-origin`. That is what makes it safe to show
 * the author's source *before* it has been through the server sanitizer: the
 * browser refuses to execute script in the frame and the frame cannot reach the
 * parent origin, so a half-typed `<script>` previews as inert markup instead of
 * running inside the admin app.
 *
 * It uses the same `renderTemplate` the server does, so variables resolve
 * identically. What it deliberately does NOT reproduce is the sanitizer and the
 * site header/footer — both are server-side, and faking them here would mean a
 * second implementation to drift out of step with the real one. The editor says
 * so plainly and swaps to the real server render on save.
 */

const DEVICE_WIDTHS = { desktop: null, tablet: 820, mobile: 390 } as const;
export type PreviewDevice = keyof typeof DEVICE_WIDTHS;

function frameDocument(body: string, brandColor: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --sb-brand: ${brandColor.replace(/[^\w#(),.%\s-]/g, "")}; --border: #e7e5e4; --card: #ffffff; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #1c1917;
    background: #fff;
    line-height: 1.6;
  }
  img { max-width: 100%; }
</style>
</head>
<body>${body}</body>
</html>`;
}

export function SiteLivePreview({
  source,
  context,
  device = "desktop",
  height = 620,
  className,
  /** Debounce in ms. Long enough to not re-render mid-word. */
  delay = 300,
}: {
  source: string;
  context: VariableContext | null;
  device?: PreviewDevice;
  height?: number;
  className?: string;
  delay?: number;
}) {
  const [debounced, setDebounced] = useState(source);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(source), delay);
    return () => clearTimeout(t);
  }, [source, delay]);

  const srcDoc = useMemo(() => {
    if (!context) return frameDocument("", "#0f172a");
    let body: string;
    try {
      body = renderTemplate(debounced, context);
    } catch {
      // The engine is written not to throw, but a preview that renders nothing
      // is still better than one that takes the editor down with it.
      body = "";
    }
    const brand =
      typeof (context.tenant as Record<string, unknown> | undefined)?.primaryColor === "string"
        ? ((context.tenant as Record<string, string>).primaryColor)
        : "#0f172a";
    return frameDocument(body, brand);
  }, [debounced, context]);

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
        // An empty sandbox is the security boundary here. Do not add
        // allow-scripts or allow-same-origin: this frame renders unsanitized
        // author input by design.
        sandbox=""
        srcDoc={srcDoc}
        title="Live preview"
        className="h-full rounded-[10px] border border-border bg-white"
        style={{ width: width ? `${width}px` : "100%", maxWidth: "100%" }}
      />
    </div>
  );
}
