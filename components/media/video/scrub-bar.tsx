"use client";

import { useCallback, useRef, useState } from "react";
import { formatDuration, spokenDuration } from "@/lib/media/format";

type Range = { start: number; end: number };

/**
 * Seek bar with buffered-range painting and a hover timestamp.
 *
 * role="slider" with aria-valuetext rather than a bare div: a screen reader
 * announcing "3725" for the position is useless, so it gets spoken time.
 *
 * While dragging, the thumb moves optimistically and the actual seek is
 * throttled — writing currentTime on every pointermove triggers a re-buffer
 * storm on a remote file.
 */
export function ScrubBar({
  currentTime,
  duration,
  buffered,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: {
  currentTime: number;
  duration: number;
  buffered: Range[];
  onSeek: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState(0);
  const lastSeek = useRef(0);

  const shown = dragging ? dragTime : currentTime;
  const pct = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0;

  const timeAt = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return f * duration;
    },
    [duration]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (duration <= 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      onScrubStart?.();
      const t = timeAt(e.clientX);
      setDragTime(t);
      onSeek(t);
      lastSeek.current = Date.now();
    },
    [duration, timeAt, onSeek, onScrubStart]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const t = timeAt(e.clientX);
      setHoverX(e.clientX - (trackRef.current?.getBoundingClientRect().left ?? 0));
      setHoverTime(t);
      if (!dragging) return;
      setDragTime(t);
      // ~10Hz is smooth to the eye and gentle on the network.
      if (Date.now() - lastSeek.current > 100) {
        onSeek(t);
        lastSeek.current = Date.now();
      }
    },
    [dragging, timeAt, onSeek]
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      setDragging(false);
      onSeek(dragTime);
      onScrubEnd?.();
    },
    [dragging, dragTime, onSeek, onScrubEnd]
  );

  return (
    <div className="relative w-full">
      {hoverX != null && duration > 0 ? (
        <div
          className="num pointer-events-none absolute -top-7 z-10 -translate-x-1/2 rounded-[4px] bg-black/85 px-1.5 py-0.5 text-[11px] font-bold text-white"
          style={{ left: `${hoverX}px` }}
        >
          {formatDuration(hoverTime)}
        </div>
      ) : null}

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(duration))}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${spokenDuration(shown)} of ${spokenDuration(duration)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHoverX(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            onSeek(Math.max(0, currentTime - 5));
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            onSeek(Math.min(duration, currentTime + 5));
          }
        }}
        className="group relative flex h-5 w-full cursor-pointer touch-none items-center outline-none"
      >
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/25">
          {duration > 0
            ? buffered.map((r, i) => (
                <div
                  key={i}
                  className="absolute inset-y-0 bg-white/35"
                  style={{
                    left: `${(r.start / duration) * 100}%`,
                    width: `${((r.end - r.start) / duration) * 100}%`,
                  }}
                />
              ))
            : null}
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${pct}%`, background: "var(--primary)" }}
          />
        </div>
        <div
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 rounded-full border-2 border-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{
            left: `${pct}%`,
            background: "var(--primary)",
            opacity: dragging ? 1 : undefined,
          }}
        />
      </div>
    </div>
  );
}
