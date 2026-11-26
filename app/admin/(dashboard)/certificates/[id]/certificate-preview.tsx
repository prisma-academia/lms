"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ScopedHtml } from "@/lib/content/sanitize-html";
import { renderCertificatePreview } from "@/lib/certificates/render-html";
import { renderTemplate, type VariableContext } from "@/lib/site/template";
import { cn } from "@/lib/utils";

/**
 * A certificate, shown small.
 *
 * `preview` is the output of the real certificate pipeline (variables filled
 * in, then sanitized and scoped). The gallery and the AI panel are handed it by
 * the server; the as-you-type preview below produces it here, from the same
 * function. Either way it is laid out at the width a learner sees it and
 * then scaled to fit, rather than simply rendered narrower: a certificate is a
 * fixed page, and one whose sizes are in rem would otherwise re-flow at
 * thumbnail width and show a layout nobody will ever print.
 *
 * The scaling transform does a second job. A transformed element is the
 * containing block for `position: fixed` inside it, so a design that tries to
 * pin something to the viewport is pinned to its own box, and `overflow:
 * hidden` clips the rest.
 */

/** The width of the certificate column on a learner's screen (`max-w-4xl`). */
const DESIGN_WIDTH = 896;

export function ScaledCertificate({
  preview,
  label,
  className,
}: {
  preview: ScopedHtml;
  /** What this picture is, for someone who cannot see it. */
  label: string;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ scale: number; height: number } | null>(null);

  // Stable objects: React rewrites innerHTML whenever it is handed a NEW
  // `{ __html }` object, even one holding the same string.
  const html = useMemo(() => ({ __html: preview.html }), [preview.html]);
  const css = useMemo(() => (preview.css ? { __html: preview.css } : null), [preview.css]);

  useEffect(() => {
    const frame = outer.current;
    const page = inner.current;
    if (!frame || !page) return;
    // Observing starts with a callback for the current size, so this also does
    // the first measurement.
    const observer = new ResizeObserver(() => {
      const scale = frame.clientWidth / DESIGN_WIDTH;
      const height = page.offsetHeight * scale;
      setBox((prev) => (prev && prev.scale === scale && prev.height === height ? prev : { scale, height }));
    });
    observer.observe(frame);
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={outer}
      role="img"
      aria-label={label}
      className={cn("relative w-full overflow-hidden rounded-[6px] border border-border bg-white", className)}
      style={{
        // Until it is measured, hold the shape of a landscape sheet.
        height: box ? box.height : undefined,
        aspectRatio: box ? undefined : "1.414 / 1",
        isolation: "isolate",
      }}
    >
      {css ? <style dangerouslySetInnerHTML={css} /> : null}
      <div
        ref={inner}
        data-css-scope={preview.scope}
        // A picture, not a page: nothing in it can be focused or clicked.
        inert
        style={{
          width: DESIGN_WIDTH,
          transform: `scale(${box?.scale ?? 1})`,
          transformOrigin: "top left",
          visibility: box ? "visible" : "hidden",
        }}
        dangerouslySetInnerHTML={html}
      />
    </div>
  );
}

/** How many elements a piece of markup opens — enough to say "something was left out". */
function countElements(markup: string): number {
  return (markup.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "").match(/<[a-zA-Z][a-zA-Z0-9-]*\b/g) ?? []).length;
}

/**
 * The as-you-type preview in the certificate editor.
 *
 * It is the learner's certificate, not an approximation of it: the source goes
 * through `renderCertificatePreview` — the same interpolate-then-sanitize
 * pipeline that renders an issued certificate — and is drawn by the same
 * component that draws the gallery and the AI's proposals. So what the author
 * sees here is what will be printed: a `<script>` or a form is already gone,
 * and a rule the certificate policy drops is already dropped.
 *
 * (It used to borrow the website builder's preview, which applies the SITE
 * rules — forms allowed, different CSS limits — to a document that is rendered
 * for learners under the CERTIFICATE rules. The two disagreed in exactly the
 * places an author most needs the preview to be right.)
 */
export function LiveCertificatePreview({
  source,
  context,
  scopeId,
  delay = 300,
}: {
  /** The certificate's HTML source, with its {{ variables }} unresolved. */
  source: string;
  /** Sample award data and the academy's real branding. */
  context: Record<string, unknown>;
  /** Unique on the page, so this preview's styles cannot reach another's. */
  scopeId: string;
  /** Debounce in ms: long enough not to re-render mid-word. */
  delay?: number;
}) {
  const [debounced, setDebounced] = useState(source);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(source), delay);
    return () => clearTimeout(timer);
  }, [source, delay]);

  const { preview, removed } = useMemo(() => {
    const rendered = renderCertificatePreview(debounced, context, scopeId);
    return {
      preview: rendered,
      // Counted after the variables are filled in: an `{{#if}}` that shows
      // nothing for the sample data has removed nothing.
      removed: Math.max(
        0,
        countElements(renderTemplate(debounced, context as VariableContext)) - countElements(rendered.html)
      ),
    };
  }, [debounced, context, scopeId]);

  if (!debounced.trim()) {
    return (
      <p className="rounded-[10px] border-2 border-dashed border-border px-4 py-10 text-center text-sm font-medium text-muted-foreground">
        Nothing to show yet. Choose a design above or write the HTML.
      </p>
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-3xl">
        <ScaledCertificate preview={preview} label="Live preview of this certificate, with sample details" />
      </div>
      {removed > 0 ? (
        <p role="status" className="mt-2 text-xs font-bold text-foreground">
          {removed} {removed === 1 ? "element is" : "elements are"} not allowed on a certificate and{" "}
          {removed === 1 ? "has" : "have"} been left out, here and for learners.
        </p>
      ) : null}
    </div>
  );
}
