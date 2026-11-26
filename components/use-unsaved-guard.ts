"use client";

import { useEffect, useState } from "react";

/**
 * Ask before a tab with unsaved work is closed or reloaded.
 *
 * The long editors (a course's details, a quiz, a question bank, a group) hold
 * minutes of typing in memory until Save is pressed. Closing the tab, pressing
 * refresh or following a bookmark threw that away without a word.
 *
 * While `dirty` is true the browser shows its own "leave site?" prompt on those
 * three. The browser owns the wording; a page may only say there is something
 * to lose — which is why nothing is listening once the form is clean again, so
 * the prompt never appears for somebody who has nothing unsaved.
 *
 * It does not cover moving to another page of the app by a link: the router
 * offers no way to hold that navigation, and a guard that works for some exits
 * and silently not for others is best described honestly rather than faked.
 */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

/**
 * Whether a form differs from what was last saved, and a way to say "this is
 * saved now".
 *
 * `current` is everything the form would send, as plain data. It is compared
 * by its JSON, so it needs no stable identity — build it inline each render.
 * Keep it to what Save actually writes: a search box or an open panel is not
 * unsaved work.
 *
 *   const saved = useSavedSnapshot({ title, description });
 *   useUnsavedGuard(saved.dirty);
 *   …after a successful save:  saved.markSaved();
 *
 * `resetKey` is for a form that is loaded with something new while the page
 * stays put — an inline editor opened on one record and then another. When the
 * key changes, whatever the form holds at that moment becomes the saved state,
 * so opening a record to look at it is not "unsaved work".
 */
export function useSavedSnapshot(
  current: unknown,
  resetKey: string | number | null = null
): {
  dirty: boolean;
  /** Record the form as it is now as the saved state. */
  markSaved: () => void;
} {
  // Recomputed every render on purpose: the caller builds `current` inline, so
  // there is no stable identity to memoise on, and these forms are small.
  const serialized = JSON.stringify(current);
  // The first render's value is the saved state: the form was just loaded.
  const [saved, setSaved] = useState(serialized);
  const [key, setKey] = useState(resetKey);
  // Adjusting state while rendering, as React documents for "reset when a prop
  // changes": cheaper than an effect, and the form never renders as dirty for
  // the one frame between being loaded and being recorded.
  if (key !== resetKey) {
    setKey(resetKey);
    setSaved(serialized);
  }
  return {
    dirty: key === resetKey && serialized !== saved,
    markSaved: () => setSaved(serialized),
  };
}
