"use client";

import { useEffect } from "react";

export type MediaKeyActions = {
  togglePlay: () => void;
  seekBy: (delta: number) => void;
  seekToFraction: (f: number) => void;
  adjustVolume: (delta: number) => void;
  toggleMute: () => void;
  toggleFullscreen: () => void;
  toggleCaptions: () => void;
  togglePip: () => void;
  cycleRate: (dir: 1 | -1) => void;
  showHelp: () => void;
};

/**
 * Standard player keyboard shortcuts, bound to the player element.
 *
 * Ignores events while a text field is focused or a modifier is held, so
 * typing in a search box or hitting Ctrl+F never scrubs the video.
 */
export function useMediaKeys(
  ref: React.RefObject<HTMLElement | null>,
  actions: MediaKeyActions,
  enabled = true
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const k = e.key;
      // Digits seek to N x 10% of the duration.
      if (k >= "0" && k <= "9") {
        e.preventDefault();
        actions.seekToFraction(Number(k) / 10);
        return;
      }

      switch (k) {
        case " ":
        case "k":
          e.preventDefault();
          actions.togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          actions.seekBy(-5);
          break;
        case "ArrowRight":
          e.preventDefault();
          actions.seekBy(5);
          break;
        case "j":
          e.preventDefault();
          actions.seekBy(-10);
          break;
        case "l":
          e.preventDefault();
          actions.seekBy(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          actions.adjustVolume(0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          actions.adjustVolume(-0.1);
          break;
        case "m":
          e.preventDefault();
          actions.toggleMute();
          break;
        case "f":
          e.preventDefault();
          actions.toggleFullscreen();
          break;
        case "c":
          e.preventDefault();
          actions.toggleCaptions();
          break;
        case "p":
          e.preventDefault();
          actions.togglePip();
          break;
        case ">":
        case ".":
          e.preventDefault();
          actions.cycleRate(1);
          break;
        case "<":
        case ",":
          e.preventDefault();
          actions.cycleRate(-1);
          break;
        case "?":
          e.preventDefault();
          actions.showHelp();
          break;
      }
    }

    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [ref, actions, enabled]);
}
