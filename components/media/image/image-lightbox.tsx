"use client";

import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * Pan/zoom image viewer.
 *
 * Built rather than pulled in: every lightbox library is heavier than the
 * ~150 lines this needs, and none of them theme cleanly.
 *
 * Zoom has real buttons as well as pinch/wheel — pinch is unreachable by
 * keyboard and by anyone using a mouse without a scroll wheel.
 */
export function ImageLightbox({ src, alt }: { src: string; alt: string }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  const zoomTo = useCallback((next: number) => {
    const clamped = Math.max(1, Math.min(6, next));
    setScale(clamped);
    if (clamped === 1) {
      setTx(0);
      setTy(0);
    }
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomTo(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      return;
    }
    dragging.current = scale > 1;
    last.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo((dist / pinchStart.current.dist) * pinchStart.current.scale);
      return;
    }
    if (!dragging.current) return;
    setTx((v) => v + (e.clientX - last.current.x));
    setTy((v) => v + (e.clientY - last.current.y));
    last.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) dragging.current = false;
  };

  return (
    <div className="relative overflow-hidden rounded-[14px] border-2 border-border bg-black">
      <div
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => (scale > 1 ? reset() : zoomTo(2.5))}
        className={cn(
          "flex aspect-video w-full touch-none items-center justify-center",
          scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
          className="max-h-full max-w-full select-none object-contain transition-transform duration-75"
        />
      </div>

      <div className="absolute bottom-3 right-3 flex gap-1">
        <ZoomButton label="Zoom out" onClick={() => zoomTo(scale / 1.4)} disabled={scale <= 1}>
          <Icon name="zoom-out" />
        </ZoomButton>
        <ZoomButton label="Reset zoom" onClick={reset} disabled={scale === 1}>
          <span className="num text-xs font-bold">{Math.round(scale * 100)}%</span>
        </ZoomButton>
        <ZoomButton label="Zoom in" onClick={() => zoomTo(scale * 1.4)} disabled={scale >= 6}>
          <Icon name="zoom-in" />
        </ZoomButton>
      </div>
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-9 min-w-9 items-center justify-center rounded-[8px] border-2 border-white/40 bg-black/70 px-1.5 text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}
