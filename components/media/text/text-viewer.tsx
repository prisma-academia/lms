"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { displayTitle, type MediaPayload } from "../types";

/**
 * In-page viewer for text-shaped files (txt, csv, md, json, xml, log).
 *
 * These are DOC kind, so they would otherwise render as a download card even
 * though the browser can display them perfectly well. Fetched rather than
 * iframed: an iframe of text/plain inherits no styling, cannot be scroll-gated,
 * and on some hosts triggers a download instead of rendering.
 *
 * CSV is rendered as a table — a comma-soup <pre> is unreadable on a phone.
 */

/** Guard against a 200MB log file taking the tab down. */
const MAX_BYTES = 512 * 1024;

/** Minimal RFC-4180 row splitter: handles quoted fields containing commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export function TextViewer({
  payload,
  onReachedEnd,
}: {
  payload: MediaPayload;
  /** Fires once the last line is on screen — the lesson gate's "consumed" signal. */
  onReachedEnd?: () => void;
}) {
  const { item, playbackUrl } = payload;
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playbackUrl) return;
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch(playbackUrl, { signal: controller.signal });
        if (!res.ok) throw new Error(`Could not load this file (${res.status}).`);
        const raw = await res.text();
        if (cancelled) return;
        setTruncated(raw.length > MAX_BYTES);
        setText(raw.slice(0, MAX_BYTES));
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "Could not load this file.");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [playbackUrl]);

  // Reaching the bottom of the scroll box is what "read it" means for a file
  // that has no pages and no playhead.
  useEffect(() => {
    const node = endRef.current;
    if (!node || !onReachedEnd || text == null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onReachedEnd();
      },
      { threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onReachedEnd, text]);

  if (error) {
    return (
      <div className="rounded-[14px] border-2 border-border bg-card p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-destructive">
          <Icon name="alert-triangle" className="size-4" aria-hidden /> {error}
        </p>
        {playbackUrl ? (
          <a href={playbackUrl} download={item.name} className="mt-2 inline-block text-sm font-bold underline">
            Download instead
          </a>
        ) : null}
      </div>
    );
  }

  if (text == null) {
    return (
      <div className="flex h-40 items-center justify-center rounded-[14px] border-2 border-border bg-card">
        <span className="size-7 animate-spin rounded-full border-4 border-muted border-t-foreground" />
        <span className="sr-only">Loading file…</span>
      </div>
    );
  }

  const isCsv =
    (item.contentType ?? "").toLowerCase().includes("csv") ||
    item.name.toLowerCase().endsWith(".csv");
  const rows = isCsv ? parseCsv(text) : null;

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <Icon name="file" className="size-3.5" aria-hidden />
        <span className="min-w-0 truncate">{displayTitle(item)}</span>
        {truncated ? <span className="text-warning-foreground">· preview truncated</span> : null}
        {playbackUrl ? (
          <a
            href={playbackUrl}
            download={item.name}
            className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-[8px] px-1.5 underline outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Icon name="download" className="size-3.5" aria-hidden /> Download
          </a>
        ) : null}
      </figcaption>

      <div
        // tabIndex so a keyboard user can scroll the box; a scrollable region
        // that cannot take focus is a WCAG 2.1.1 failure.
        tabIndex={0}
        role="region"
        aria-label={`Contents of ${displayTitle(item)}`}
        className="max-h-[60vh] overflow-auto overscroll-contain rounded-[14px] border-2 border-border bg-card p-3 outline-none focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring"
      >
        {rows ? (
          <table className="w-full border-collapse text-left text-[13px]">
            <tbody>
              {rows.map((cells, r) => (
                <tr key={r} className={r === 0 ? "bg-muted" : undefined}>
                  {cells.map((cell, c) =>
                    r === 0 ? (
                      <th key={c} scope="col" className="border-2 border-border px-2 py-1 font-bold">
                        {cell}
                      </th>
                    ) : (
                      <td key={c} className="num border-2 border-border px-2 py-1 font-medium">
                        {cell}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-foreground">
            {text}
          </pre>
        )}
        <div ref={endRef} aria-hidden className="h-px w-full" />
      </div>
    </figure>
  );
}
