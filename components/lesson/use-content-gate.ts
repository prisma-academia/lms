"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MEDIA_COMPLETE_FRACTION, type GateContentType } from "@/lib/courses/content-gate";

/**
 * Decides whether "Mark complete" is clickable for the lesson on screen.
 *
 * This is an honesty aid, not anti-cheat. Scroll depth and raw <video> playback
 * cannot be proven server-side, so this hook exists to stop an honest learner
 * from clicking straight through — nothing more. The server independently
 * enforces the parts it can verify (order, dwell, FILE media progress, quiz
 * 100%); see lib/courses/content-gate.ts for the full threat model.
 *
 * Two rules make this behave:
 *  - Every sub-signal LATCHES. Scrolling back up, or seeking a video backwards,
 *    must never re-disable a button that was already enabled.
 *  - The dwell clock pauses when the tab is hidden, which makes the client
 *    strictly stricter than the server. That is the safe direction to drift:
 *    the button can only enable later than the server would allow, never earlier.
 */

export type ContentGate = {
  satisfied: boolean;
  /** Short user-facing reason the button is still disabled, or null when it isn't. */
  hint: string | null;
  /** Attach to a zero-height element directly after the lesson content. */
  sentinelRef: (node: HTMLElement | null) => void;
  reportMedia: (fraction: number) => void;
  reportPage: (page: number, total: number) => void;
  reportQuizPassed: () => void;
};

/** Content types whose gate is "scrolled to the end". */
function usesScrollGate(type: GateContentType, hasViewer: boolean): boolean {
  if (type === "TEXT" || type === "HTML") return true;
  // A FILE with no inline viewer (zip, docx) is just a download link — there is
  // nothing to scroll and nothing to play, so dwell alone has to carry it.
  return type === "FILE" && !hasViewer;
}

export function useContentGate(opts: {
  lessonId: string;
  contentType: GateContentType;
  requiredSeconds: number;
  /** ISO timestamp of when this lesson was first opened; null until the open lands. */
  startedAt: string | null;
  /** True for FILE lessons rendered through MediaViewer (video/audio/pdf/image). */
  hasViewer: boolean;
  /** True when the lesson's media is playable (video/audio) rather than paged. */
  isTimedMedia: boolean;
  isPaged: boolean;
  /** Playback already saved server-side, as a 0..1 fraction. Credits prior sessions. */
  initialMediaFraction: number;
  alreadyComplete: boolean;
}): ContentGate {
  const {
    lessonId,
    contentType,
    requiredSeconds,
    startedAt,
    hasViewer,
    isTimedMedia,
    isPaged,
    initialMediaFraction,
    alreadyComplete,
  } = opts;

  // Both latches are keyed by lesson id rather than reset on change. That makes
  // switching lessons re-lock the gate for free — no effect, no cleanup, and no
  // frame where the new lesson paints with the previous lesson's button live.
  // Re-latching the same lesson is a no-op: React bails out when the state value
  // is unchanged, so a burst of timeupdate events costs one render, not many.
  const [consumedFor, setConsumedFor] = useState<string | null>(null);
  const [dwell, setDwell] = useState<{ lesson: string; seconds: number }>({
    lesson: lessonId,
    seconds: 0,
  });

  // Playback saved in an earlier session counts, so a learner who watched
  // yesterday isn't asked to watch again. Derived rather than latched: it is
  // already a fact about the lesson currently on screen.
  const preCredited = initialMediaFraction >= MEDIA_COMPLETE_FRACTION;

  const consumed = preCredited || consumedFor === lessonId;
  const elapsed = dwell.lesson === lessonId ? dwell.seconds : 0;

  const latch = useCallback(() => setConsumedFor(lessonId), [lessonId]);

  // --- dwell clock -------------------------------------------------------
  useEffect(() => {
    if (!startedAt || requiredSeconds <= 0) return;
    const started = Date.parse(startedAt);
    if (Number.isNaN(started)) return;

    // Time accrues only while the tab is actually in front of the learner. This
    // makes the client strictly stricter than the server's wall-clock check —
    // the safe direction, since the button can then only enable late, never early.
    let accrued = 0;
    let lastTick = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === "visible") accrued += (now - lastTick) / 1000;
      lastTick = now;
      setDwell({ lesson: lessonId, seconds: accrued });
      if (accrued >= requiredSeconds) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [startedAt, requiredSeconds, lessonId]);

  // --- scroll sentinel ---------------------------------------------------
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollGate = usesScrollGate(contentType, hasViewer);

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node || !scrollGate) return;

      // IntersectionObserver rather than scrollTop arithmetic: it fires
      // immediately when the target is already on screen, so a lesson shorter
      // than the viewport satisfies for free, and late-loading images that grow
      // the page can't strand the gate the way a cached scrollHeight would.
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) latch();
        },
        { root: null, rootMargin: "0px 0px 24px 0px", threshold: 0 }
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [scrollGate, latch]
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  const reportMedia = useCallback(
    (fraction: number) => {
      if (fraction >= MEDIA_COMPLETE_FRACTION) latch();
    },
    [latch]
  );

  const reportPage = useCallback(
    (page: number, total: number) => {
      if (total > 0 && page >= total) latch();
    },
    [latch]
  );

  const reportQuizPassed = useCallback(() => latch(), [latch]);

  const dwellRemaining = Math.max(0, Math.ceil(requiredSeconds - elapsed));
  const satisfied = alreadyComplete || (consumed && dwellRemaining === 0);

  const hint = useMemo(() => {
    if (satisfied) return null;
    if (!consumed) {
      if (contentType === "QUIZ") return "Pass this quiz to continue.";
      if (contentType === "EXAM") return "Pass this exam to continue (once your result is released).";
      if (isTimedMedia) return "Watch to the end to continue.";
      if (isPaged) return "Read to the last page to continue.";
      if (scrollGate) return "Scroll to the end of the lesson to continue.";
      return "Open the file, then mark this complete.";
    }
    return `${dwellRemaining}s left before you can mark this complete.`;
  }, [satisfied, consumed, contentType, isTimedMedia, isPaged, scrollGate, dwellRemaining]);

  return { satisfied, hint, sentinelRef, reportMedia, reportPage, reportQuizPassed };
}
