"use client";

import type { ClientSecurity } from "@/lib/exams/candidate-view";

/**
 * Browser lockdown for the exam window.
 *
 * A web page cannot stop someone closing the browser or switching apps; what
 * it can do is notice, refuse what it can (copy, print, shortcuts, Back), keep
 * the paper hidden outside fullscreen, and report every attempt so the strike
 * policy and the invigilator can act. For true can't-leave lockdown the exam
 * requires Safe Exam Browser instead (see lib/exams/seb.ts).
 *
 * Leaving is counted ONCE per episode: a tab switch fires blur, visibilitychange
 * and often fullscreenchange together, and that is one violation, not three.
 */

export type LockdownEvent = { type: string; detail?: Record<string, unknown> };

export type LockdownOptions = {
  security: ClientSecurity;
  onEvent: (e: LockdownEvent) => void;
  /** Called when the candidate leaves / comes back; `awayMs` on return. */
  onAway: (away: boolean, awayMs: number) => void;
  onFullscreenChange: (fullscreen: boolean) => void;
  /** A blocked action happened — show a short warning. */
  onBlocked: (message: string) => void;
};

const EDITABLE = "input, textarea, select, [contenteditable='true']";

function inEditable(t: EventTarget | null): boolean {
  return t instanceof Element && !!t.closest(EDITABLE);
}

export function isFullscreen(): boolean {
  return typeof document !== "undefined" && !!document.fullscreenElement;
}

export async function enterFullscreen(): Promise<boolean> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    // Chromium: capture Esc and system shortcuts while fullscreen (long-press Esc still exits).
    const kb = (navigator as Navigator & { keyboard?: { lock?: (keys?: string[]) => Promise<void> } }).keyboard;
    await kb?.lock?.().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

export function multiScreen(): boolean {
  const s = window.screen as Screen & { isExtended?: boolean };
  return s.isExtended === true;
}

export function createLockdown(opts: LockdownOptions) {
  const s = opts.security;
  const offs: (() => void)[] = [];
  let awaySince: number | null = null;
  let lastDevtools = 0;
  let wasFullscreen = isFullscreen();

  const on = <K extends keyof WindowEventMap | keyof DocumentEventMap>(
    type: K,
    fn: (e: K extends keyof WindowEventMap ? WindowEventMap[K] : K extends keyof DocumentEventMap ? DocumentEventMap[K] : Event) => void,
    target: Window | Document = window
  ) => {
    target.addEventListener(type, fn as EventListener, { capture: true });
    offs.push(() => target.removeEventListener(type, fn as EventListener, { capture: true }));
  };

  function leave(reason: "TAB_HIDDEN" | "WINDOW_BLUR" | "FULLSCREEN_EXIT") {
    if (awaySince !== null) return;
    awaySince = Date.now();
    opts.onEvent({ type: reason });
    opts.onAway(true, 0);
  }
  function back() {
    if (awaySince === null) return;
    const ms = Date.now() - awaySince;
    awaySince = null;
    opts.onEvent({ type: "RETURNED", detail: { awayMs: ms } });
    opts.onAway(false, ms);
  }

  function start() {
    if (s.detectTabSwitch) {
      on("visibilitychange", () => (document.visibilityState === "hidden" ? leave("TAB_HIDDEN") : document.hasFocus() && back()), document);
      on("blur", () => {
        // A focus move into an iframe/audio control is not leaving.
        setTimeout(() => {
          if (!document.hasFocus() && document.visibilityState === "visible") leave("WINDOW_BLUR");
        }, 300);
      });
      on("focus", () => document.visibilityState === "visible" && (s.requireFullscreen ? isFullscreen() : true) && back());
    }

    on("fullscreenchange", () => {
      const fs = isFullscreen();
      opts.onFullscreenChange(fs);
      if (wasFullscreen && !fs && s.requireFullscreen) leave("FULLSCREEN_EXIT");
      if (fs) {
        opts.onEvent({ type: "FULLSCREEN_ENTER" });
        if (document.hasFocus()) back();
      }
      wasFullscreen = fs;
    }, document);

    const clip = (type: "COPY" | "CUT" | "PASTE") => (e: ClipboardEvent) => {
      if (!s.blockClipboard) return;
      e.preventDefault();
      opts.onEvent({ type });
      opts.onBlocked(type === "PASTE" ? "Pasting is not allowed in this exam." : "Copying is not allowed in this exam.");
    };
    on("copy", clip("COPY"), document);
    on("cut", clip("CUT"), document);
    on("paste", clip("PASTE"), document);

    on("contextmenu", (e) => {
      if (!s.blockContextMenu) return;
      e.preventDefault();
      opts.onEvent({ type: "CONTEXT_MENU" });
    }, document);

    on("dragstart", (e) => {
      if (!inEditable(e.target) && !(e.target instanceof Element && e.target.closest("[draggable='true']"))) e.preventDefault();
    }, document);
    on("selectstart", (e) => {
      if (s.blockClipboard && !inEditable(e.target) && !(e.target instanceof Element && e.target.closest("[data-allow-select]"))) e.preventDefault();
    }, document);

    on("keydown", (e) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      let blocked: string | null = null;
      if (s.blockPrint && mod && k === "p") blocked = "PRINT_ATTEMPT";
      else if (s.blockShortcuts) {
        if (k === "f12") blocked = "KEY_BLOCKED";
        else if (mod && e.shiftKey && ["i", "j", "c", "k"].includes(k)) blocked = "KEY_BLOCKED";
        else if (mod && ["u", "s", "o", "f", "g", "h", "n", "t"].includes(k)) blocked = "KEY_BLOCKED";
        else if (k === "f5" || (mod && k === "r")) blocked = "KEY_BLOCKED";
        else if (e.altKey && (k === "arrowleft" || k === "arrowright")) blocked = "KEY_BLOCKED";
      }
      if (s.blockClipboard && mod && ["c", "x", "v", "a"].includes(k) && !inEditable(e.target)) blocked = blocked ?? "KEY_BLOCKED";
      if (s.blockClipboard && mod && k === "v" && inEditable(e.target)) blocked = "PASTE";
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
        opts.onEvent({ type: blocked, detail: { key: e.key, ctrl: mod, shift: e.shiftKey, alt: e.altKey } });
        opts.onBlocked(blocked === "PRINT_ATTEMPT" ? "Printing is not allowed in this exam." : "That shortcut is disabled during the exam.");
      }
    });
    on("keyup", (e) => {
      if (e.key === "PrintScreen") {
        opts.onEvent({ type: "KEY_BLOCKED", detail: { key: "PrintScreen" } });
        // Best effort: overwrite the clipboard so the capture is not pasted elsewhere.
        navigator.clipboard?.writeText?.(" ").catch(() => undefined);
      }
    });

    on("beforeprint", () => {
      if (s.blockPrint) opts.onEvent({ type: "PRINT_ATTEMPT" });
    });

    // Leaving the page asks first; Back does nothing.
    on("beforeunload", (e) => {
      e.preventDefault();
      e.returnValue = "";
    });
    history.pushState({ exam: true }, "", location.href);
    on("popstate", () => {
      history.pushState({ exam: true }, "", location.href);
      opts.onBlocked("You cannot leave the exam with the Back button.");
    });

    // Second screen (Chromium exposes this without a permission prompt).
    if (s.detectMultiScreen) {
      const check = () => multiScreen() && opts.onEvent({ type: "MULTI_SCREEN" });
      check();
      const t = setInterval(check, 30_000);
      offs.push(() => clearInterval(t));
    }

    // Docked developer tools shrink the viewport well below the window. A
    // signal for the invigilator, never a strike on its own.
    const dev = setInterval(() => {
      if (isFullscreen()) return;
      const gapW = window.outerWidth - window.innerWidth;
      const gapH = window.outerHeight - window.innerHeight;
      if ((gapW > 240 || gapH > 300) && Date.now() - lastDevtools > 60_000) {
        lastDevtools = Date.now();
        opts.onEvent({ type: "DEVTOOLS_SUSPECTED", detail: { gapW, gapH } });
      }
    }, 5_000);
    offs.push(() => clearInterval(dev));
  }

  function stop() {
    offs.splice(0).forEach((f) => f());
    const kb = (navigator as Navigator & { keyboard?: { unlock?: () => void } }).keyboard;
    kb?.unlock?.();
  }

  return { start, stop, awaySince: () => awaySince };
}
