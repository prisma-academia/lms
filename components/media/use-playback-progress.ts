"use client";

import { useCallback, useEffect, useRef } from "react";
import { apiPut } from "@/lib/client/api";

/** Save at most this often while playing. */
const SAVE_INTERVAL_MS = 15_000;
/** Below this, treat it as "not really started" and do not offer a resume. */
const MIN_RESUME_SECONDS = 5;
/** Above this fraction, the learner effectively finished — resume from the top. */
const MAX_RESUME_FRACTION = 0.95;

function readCsrfCookie(): string {
  const m = document.cookie.match(/(?:^|;\s*)mt-csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

/**
 * Persists playback position for a library item.
 *
 * Periodic saves while playing, plus a final save on pause/end/hide/unload.
 * The unload paths use sendBeacon, which is the only thing that reliably
 * survives a closing tab — a normal fetch is cancelled. sendBeacon cannot set
 * headers, so the CSRF token rides in the body (the endpoint accepts both).
 */
export function usePlaybackProgress(itemId: string, enabled: boolean) {
  const lastSaved = useRef(0);
  const position = useRef(0);
  const duration = useRef(0);

  const flush = useCallback(
    (opts?: { beacon?: boolean; completed?: boolean }) => {
      if (!enabled) return;
      const pos = Math.floor(position.current);
      if (pos <= 0 && !opts?.completed) return;
      // Skip no-op saves; scrubbing back and forth would otherwise spam writes.
      if (!opts?.completed && Math.abs(pos - lastSaved.current) < 3) return;
      lastSaved.current = pos;

      const body = {
        positionSeconds: pos,
        ...(opts?.completed ? { completed: true } : {}),
        csrfToken: readCsrfCookie(),
      };
      const url = `/api/client/library/${itemId}/progress`;

      if (opts?.beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([JSON.stringify(body)], { type: "application/json" }));
        return;
      }
      void apiPut(url, body);
    },
    [itemId, enabled]
  );

  const report = useCallback((pos: number, dur: number) => {
    position.current = pos;
    duration.current = dur;
  }, []);

  // Periodic save while the media is actually playing.
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => flush(), SAVE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [enabled, flush]);

  // Tab hidden or page going away: last chance to record where they got to.
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") flush({ beacon: true });
    };
    const onPageHide = () => flush({ beacon: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      flush();
    };
  }, [enabled, flush]);

  return { report, flush };
}

/** Whether a saved position is worth offering as a resume point. */
export function shouldOfferResume(saved: number | null | undefined, duration: number | null): boolean {
  if (!saved || saved < MIN_RESUME_SECONDS) return false;
  if (duration && saved > duration * MAX_RESUME_FRACTION) return false;
  return true;
}
