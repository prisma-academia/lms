"use client";

import "katex/dist/katex.min.css";
import katex from "katex";
import { Fragment, useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Plain text with LaTeX maths: `$…$` inline, `$$…$$` on its own line.
 *
 * Everything outside the delimiters is rendered as TEXT (React escapes it), and
 * KaTeX runs with `trust: false`, so a question can never inject markup or
 * links — the rule for tenant-authored content (no tenant HTML or JS runs on
 * the shared staff/learner origin). A `\$` is a literal dollar sign.
 *
 * Line breaks in the source are kept.
 */

type Part = { kind: "text"; value: string } | { kind: "math"; value: string; display: boolean };

export function splitMath(source: string): Part[] {
  const parts: Part[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) parts.push({ kind: "text", value: buf });
    buf = "";
  };
  while (i < source.length) {
    const c = source[i];
    if (c === "\\" && source[i + 1] === "$") {
      buf += "$";
      i += 2;
      continue;
    }
    if (c === "$") {
      const display = source[i + 1] === "$";
      const open = display ? 2 : 1;
      const close = source.indexOf(display ? "$$" : "$", i + open);
      // An unmatched "$" (a price, say) is just text.
      if (close > i + open - 1 && close !== -1) {
        const tex = source.slice(i + open, close);
        if (tex.trim() && (display || !tex.includes("\n"))) {
          flush();
          parts.push({ kind: "math", value: tex, display });
          i = close + open;
          continue;
        }
      }
    }
    buf += c;
    i++;
  }
  flush();
  return parts;
}

export function renderTex(tex: string, display: boolean): string {
  return katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    trust: false,
    strict: "ignore",
    output: "htmlAndMathml",
    maxSize: 20,
    maxExpand: 200,
  });
}

function Lines({ value }: { value: string }) {
  const lines = value.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </>
  );
}

export function MathText({
  children,
  className,
  as: Tag = "span",
}: {
  children: string | null | undefined;
  className?: string;
  as?: "span" | "div" | "p";
}) {
  const source = children ?? "";
  const parts = useMemo(() => splitMath(source), [source]);
  const hasMath = parts.some((p) => p.kind === "math");
  if (!hasMath) {
    return (
      <Tag className={cn("whitespace-pre-wrap", className)}>
        <Lines value={source} />
      </Tag>
    );
  }
  return (
    <Tag className={className}>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <Lines key={i} value={p.value} />
        ) : (
          <span
            key={i}
            className={p.display ? "my-2 block overflow-x-auto" : undefined}
            // KaTeX output from author TeX with trust:false — no raw HTML passes through.
            dangerouslySetInnerHTML={{ __html: renderTex(p.value, p.display) }}
          />
        )
      )}
    </Tag>
  );
}

/** A single TeX expression (the equation input's live preview). */
export function TexPreview({ tex, className }: { tex: string; className?: string }) {
  const html = useMemo(() => (tex.trim() ? renderTex(tex, true) : ""), [tex]);
  if (!html) return null;
  return <div className={cn("overflow-x-auto", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
