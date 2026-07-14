"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Global top progress bar shown during route transitions. It starts when an
 * internal link is clicked and completes when the pathname / query settles,
 * giving immediate feedback before the destination's loading.tsx renders.
 *
 * Colour is the tenant brand (`--brand`, set by BrandColorSync in the shells)
 * with a neutral fallback. The global reduced-motion rule in globals.css
 * disables the width/opacity transitions automatically.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  // Shared finish() so the pathname-change effect can complete a run without
  // calling setState synchronously inside the effect body.
  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    function clearTimers() {
      if (trickle.current) clearInterval(trickle.current);
      if (safety.current) clearTimeout(safety.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      trickle.current = null;
      safety.current = null;
      hideTimer.current = null;
    }

    function finish() {
      if (!active.current) return;
      active.current = false;
      if (trickle.current) clearInterval(trickle.current);
      if (safety.current) clearTimeout(safety.current);
      trickle.current = null;
      safety.current = null;
      setProgress(100);
      hideTimer.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 220);
    }
    finishRef.current = finish;

    function start() {
      clearTimers();
      active.current = true;
      setVisible(true);
      setProgress(8);
      trickle.current = setInterval(() => {
        setProgress((p) => (p >= 90 ? p : p + Math.max(0.5, (90 - p) / 12)));
      }, 200);
      // Failsafe: if navigation never resolves (e.g. same-URL click), auto-clear.
      safety.current = setTimeout(finish, 8000);
    }

    function onClick(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      const target = anchor.getAttribute("target");
      if (!href || href.startsWith("#") || (target && target !== "_self")) return;
      if (anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same URL → no navigation, so no bar (would otherwise stick).
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      start();
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      clearTimers();
    };
  }, []);

  // Navigation settled → complete and hide. Defer to a task so the state
  // update does not run synchronously inside the effect body.
  useEffect(() => {
    const t = setTimeout(() => finishRef.current(), 0);
    return () => clearTimeout(t);
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[2000] h-[3px]"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}
    >
      <div
        className="h-full origin-left"
        style={{
          width: `${progress}%`,
          background: "var(--brand, var(--yellow))",
          boxShadow: "0 0 8px var(--brand, var(--yellow))",
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}
