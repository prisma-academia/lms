"use client";

import { useCallback, useEffect, useRef } from "react";
import { spokenDuration } from "@/lib/media/format";

/**
 * Canvas waveform driven by a PRE-COMPUTED peaks array.
 *
 * Deliberately not wavesurfer.js: it fetches and decodeAudioData()s the entire
 * file to draw the waveform, which on a 60-minute lecture over mobile data is
 * a disaster. When `peaks` is absent this degrades to a plain bar, and the
 * interaction contract is identical either way.
 */
export function Waveform({
  peaks,
  currentTime,
  duration,
  onSeek,
}: {
  peaks: number[] | null | undefined;
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !peaks || peaks.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Read the resolved theme colours so the waveform re-themes per tenant.
    const styles = getComputedStyle(document.documentElement);
    const played = styles.getPropertyValue("--primary").trim() || "#000";
    const unplayed = styles.getPropertyValue("--muted-foreground").trim() || "#888";

    const barW = 2;
    const gap = 1;
    const count = Math.max(1, Math.floor(w / (barW + gap)));
    const step = peaks.length / count;
    const mid = h / 2;

    for (let i = 0; i < count; i++) {
      const peak = peaks[Math.floor(i * step)] ?? 0;
      const barH = Math.max(2, peak * (h - 4));
      const x = i * (barW + gap);
      const fraction = duration > 0 ? currentTime / duration : 0;
      ctx.fillStyle = i / count <= fraction ? played : unplayed;
      ctx.globalAlpha = i / count <= fraction ? 1 : 0.4;
      ctx.fillRect(x, mid - barH / 2, barW, barH);
    }
    ctx.globalAlpha = 1;
  }, [peaks, currentTime, duration]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Redraw on resize and on a theme switch, not per animation frame.
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    const mo = new MutationObserver(() => draw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [draw]);

  const seekAt = (clientX: number) => {
    const el = wrapRef.current;
    if (!el || duration <= 0) return;
    const rect = el.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration);
  };

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      ref={wrapRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, Math.round(duration))}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={`${spokenDuration(currentTime)} of ${spokenDuration(duration)}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekAt(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) seekAt(e.clientX);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onSeek(Math.max(0, currentTime - 5));
        if (e.key === "ArrowRight") onSeek(Math.min(duration, currentTime + 5));
      }}
      className="relative h-12 w-full cursor-pointer touch-none outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {peaks && peaks.length > 0 ? (
        <canvas ref={canvasRef} className="size-full" />
      ) : (
        // No peaks computed for this file — plain scrubber, same semantics.
        <div className="flex h-full items-center">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--primary)" }} />
          </div>
        </div>
      )}
    </div>
  );
}
