"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import type { MediaPayload } from "../types";

/**
 * PDF viewer on pdf.js.
 *
 * Not an <iframe>: the requirements include search, a page rail and download
 * gating, and an iframe gives none of them — the browser's built-in viewer
 * renders its own toolbar with download and print that cannot be removed
 * (#toolbar=0 is a Chrome-only hint, ignored elsewhere), and iOS Safari often
 * refuses to render application/pdf inline at all.
 *
 * Not react-pdf either: pdf.js exports what we need directly and we would be
 * writing the search and thumbnail UI regardless, so that is one less version
 * to keep in lockstep.
 *
 * The whole module is dynamically imported by media-viewer, so only a learner
 * who actually opens a PDF pays the bundle cost.
 */

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void };
  getTextContent: () => Promise<{ items: { str: string }[] }>;
};

export default function PdfViewer({ payload }: { payload: MediaPayload }) {
  const { item, playbackUrl, access } = payload;
  const canDownload = access.state === "open" && access.canDownload;

  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [failed, setFailed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<number[]>([]);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textCache = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    if (!playbackUrl) return;
    let cancelled = false;
    let loaded: PdfDoc | null = null;

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        // When download is gated, fetch the bytes and hand pdf.js `data` rather
        // than `url`, so no copy-pasteable object URL sits in the network tab.
        // Be clear-eyed: this raises the cost of casually saving the file. It
        // is NOT DRM — the bytes are in the browser either way. The real
        // control is the short-lived signed URL.
        let source: { url: string } | { data: ArrayBuffer };
        if (!canDownload) {
          const res = await fetch(playbackUrl);
          source = { data: await res.arrayBuffer() };
        } else {
          source = { url: playbackUrl };
        }

        const task = pdfjs.getDocument(source as never);
        const d = (await task.promise) as unknown as PdfDoc;
        if (cancelled) {
          void d.destroy();
          return;
        }
        loaded = d;
        setDoc(d);
        setNumPages(d.numPages);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [playbackUrl, canDownload]);

  const runSearch = useCallback(async () => {
    if (!doc || !term.trim()) {
      setHits([]);
      return;
    }
    setSearching(true);
    const needle = term.trim().toLowerCase();
    const found: number[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      let text = textCache.current.get(n);
      if (text === undefined) {
        const p = await doc.getPage(n);
        const tc = await p.getTextContent();
        text = tc.items.map((i) => i.str).join(" ").toLowerCase();
        textCache.current.set(n, text);
      }
      if (text.includes(needle)) found.push(n);
    }
    setHits(found);
    setSearching(false);
    if (found.length > 0) setPage(found[0]);
  }, [doc, term]);

  if (!playbackUrl) return null;

  // Worker failed to boot (blocked script, old browser): fall back to the
  // browser's own renderer, and a plain link below that.
  if (failed) {
    return (
      <div className="rounded-[14px] border-2 border-border bg-card p-3">
        <p className="mb-2 text-sm text-muted-foreground">
          The built-in reader could not start. Showing your browser&apos;s viewer instead.
        </p>
        <object data={playbackUrl} type="application/pdf" className="h-[70vh] w-full rounded-[8px]">
          <a href={playbackUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline">
            Open {item.name}
          </a>
        </object>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[14px] border-2 border-border bg-card">
      <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-border p-2">
        <Button type="button" size="icon-sm" variant="outline" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          <Icon name="chevron-down" className="rotate-90" />
        </Button>
        <span className="num text-sm font-bold">
          <input
            type="number"
            value={page}
            min={1}
            max={numPages || 1}
            onChange={(e) => setPage(Math.max(1, Math.min(numPages || 1, Number(e.target.value) || 1)))}
            aria-label="Page number"
            className="w-12 rounded-[6px] border-2 border-border bg-background px-1 py-0.5 text-center"
          />{" "}
          / {numPages || "…"}
        </span>
        <Button type="button" size="icon-sm" variant="outline" aria-label="Next page" disabled={page >= numPages} onClick={() => setPage((p) => Math.min(numPages, p + 1))}>
          <Icon name="chevron-down" className="-rotate-90" />
        </Button>

        <span className="mx-1 h-5 w-px bg-border" />

        <Button type="button" size="icon-sm" variant="outline" aria-label="Zoom out" onClick={() => { setFitWidth(false); setZoom((z) => Math.max(0.5, z - 0.25)); }}>
          <Icon name="zoom-out" />
        </Button>
        <Button type="button" size="sm" variant={fitWidth ? "default" : "outline"} onClick={() => setFitWidth((v) => !v)}>
          Fit width
        </Button>
        <Button type="button" size="icon-sm" variant="outline" aria-label="Zoom in" onClick={() => { setFitWidth(false); setZoom((z) => Math.min(3, z + 0.25)); }}>
          <Icon name="zoom-in" />
        </Button>

        <Button type="button" size="icon-sm" variant={searchOpen ? "default" : "outline"} aria-label="Search document" onClick={() => setSearchOpen((v) => !v)}>
          <Icon name="search" />
        </Button>

        {canDownload ? (
          <a
            href={playbackUrl}
            download={item.name}
            className="ml-auto inline-flex items-center gap-1 rounded-[8px] border-2 border-border bg-card px-2.5 py-1.5 text-sm font-bold"
          >
            <Icon name="download" className="size-4" /> Download
          </a>
        ) : null}
      </div>

      {searchOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-b-2 border-border p-2">
          <TextInput
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void runSearch())}
            placeholder="Find in document…"
            aria-label="Find in document"
            className="max-w-56"
          />
          <Button type="button" size="sm" variant="outline" onClick={() => void runSearch()} disabled={searching}>
            {searching ? "Searching…" : "Find"}
          </Button>
          {hits.length > 0 ? (
            <span className="num text-xs text-muted-foreground">
              {hits.length} page{hits.length === 1 ? "" : "s"}:{" "}
              {hits.slice(0, 12).map((h) => (
                <button key={h} type="button" onClick={() => setPage(h)} className="mx-0.5 underline">
                  {h}
                </button>
              ))}
            </span>
          ) : term && !searching ? (
            <span className="text-xs text-muted-foreground">No matches.</span>
          ) : null}
        </div>
      ) : null}

      <div ref={containerRef} className="max-h-[75vh] overflow-auto bg-neutral-800 p-3">
        {doc ? (
          <PdfPageCanvas doc={doc} pageNumber={page} zoom={zoom} fitWidth={fitWidth} containerRef={containerRef} />
        ) : (
          <div className="flex h-64 items-center justify-center">
            <span className="size-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          </div>
        )}
      </div>

      {numPages > 1 ? (
        <div className="flex gap-1 overflow-x-auto border-t-2 border-border p-2">
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              aria-label={`Go to page ${n}`}
              aria-current={n === page}
              className={cn(
                "num size-9 shrink-0 rounded-[6px] border-2 border-border text-xs font-bold",
                n === page ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"
              )}
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PdfPageCanvas({
  doc,
  pageNumber,
  zoom,
  fitWidth,
  containerRef,
}: {
  doc: PdfDoc;
  pageNumber: number;
  zoom: number;
  fitWidth: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    // pdf.js leaks render tasks if they are not cancelled on unmount or when
    // the scale changes mid-render.
    let task: { cancel: () => void } | null = null;

    void (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const base = page.getViewport({ scale: 1 });
      const available = (containerRef.current?.clientWidth ?? base.width) - 24;
      const scale = fitWidth ? available / base.width : zoom;
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * dpr });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      const render = page.render({ canvasContext: ctx, viewport });
      task = render;
      try {
        await render.promise;
      } catch {
        // Cancelled by a re-render; nothing to report.
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, zoom, fitWidth, containerRef]);

  return (
    <div className="flex justify-center">
      <canvas ref={canvasRef} className="max-w-full rounded-[4px] bg-white shadow-lg" />
    </div>
  );
}
