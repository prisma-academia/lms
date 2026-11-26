/** The id every shell gives its `<main>`, and what the skip link points at. */
export const MAIN_CONTENT_ID = "main-content";

/**
 * How far down a page's own sticky elements must sit to clear the shell.
 *
 * Below `lg` both shells pin a bar to the top of the window (62px: a 44px
 * control, 8px above and below, and the 2px rule). From `lg` up nothing is
 * pinned there. A page that sticks something to the top should offset it by
 * this instead of a bare `top-0`, e.g. `top-[calc(var(--shell-sticky-top)+0.5rem)]`
 * — otherwise it slides under the bar on a phone.
 *
 * Applied as classes on each shell's root, so it needs nothing in globals.css.
 */
export const SHELL_STICKY_TOP = "[--shell-sticky-top:3.875rem] lg:[--shell-sticky-top:0px]";

/**
 * "Skip to content": the first thing Tab reaches on every page.
 *
 * Without it, a keyboard user crosses the whole navigation — two dozen links
 * in the admin — on every page before reaching what they came for. It is
 * parked above the top edge until focused, then drops into view over
 * everything; being off-screen rather than hidden keeps it in the tab order.
 */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="fixed left-3 top-3 z-[60] -translate-y-[300%] rounded-[10px] border-2 border-border bg-card px-4 py-2.5 text-sm font-bold text-card-foreground shadow-md outline-none focus-visible:translate-y-0 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden"
    >
      Skip to content
    </a>
  );
}
