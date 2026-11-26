/**
 * Find the place in a rendered lesson that a "read up" link points at.
 *
 * Tried in order, because a lesson can be edited after a question was linked to
 * it: the heading by id, then the passage by its text, then nothing (the caller
 * leaves the learner at the top of the right lesson, which is still correct).
 */

export type ReviewTarget = {
  /** Heading id inside the lesson. */
  anchor: string | null;
  /** A phrase from the passage the question was drawn from. */
  excerpt: string | null;
};

/** Blocks a passage can live in. Deliberately leaf-ish: a match on a wrapper would highlight a whole section. */
const PASSAGE_BLOCKS = "p, li, blockquote, td, th, dd, dt, figcaption, pre, h2, h3, h4, h5";

/** Compare text by its letters and digits only: quotes, dashes and spacing vary between copies. */
function comparable(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findByAnchor(container: HTMLElement, anchor: string): HTMLElement | null {
  // Scoped to the lesson, never `document.getElementById`: the id comes from
  // lesson content and must not be able to send the page to an element outside it.
  for (const el of container.querySelectorAll<HTMLElement>("[id]")) {
    if (el.id === anchor) return el;
  }
  return null;
}

function findByExcerpt(container: HTMLElement, excerpt: string): HTMLElement | null {
  const wanted = comparable(excerpt);
  if (wanted.length < 12) return null; // Too short to identify a passage.

  const blocks = Array.from(container.querySelectorAll<HTMLElement>(PASSAGE_BLOCKS)).map((el) => ({
    el,
    text: comparable(el.textContent ?? ""),
  }));

  // The whole phrase first; then its opening words, which survive a passage
  // being lightly reworded at the end.
  const opening = wanted.split(" ").slice(0, 8).join(" ");
  for (const needle of opening.length >= 12 && opening !== wanted ? [wanted, opening] : [wanted]) {
    // Prefer the innermost match — the `li` rather than the `blockquote` around
    // it, the `p` rather than its `td`.
    const matches = blocks.filter((block) => block.text.includes(needle));
    const innermost = matches.find(
      (candidate) => !matches.some((other) => other !== candidate && candidate.el.contains(other.el))
    );
    if (innermost) return innermost.el;
  }
  return null;
}

export function findReviewTarget(container: HTMLElement, target: ReviewTarget): HTMLElement | null {
  if (target.anchor) {
    const heading = findByAnchor(container, target.anchor);
    if (heading) return heading;
  }
  if (target.excerpt) return findByExcerpt(container, target.excerpt);
  return null;
}

/**
 * Scroll an element of the lesson into view and move focus to it, so a
 * screen-reader user hears where they landed and the next Tab continues from
 * there. Returns whether a tabindex had to be added to make that possible.
 */
export function goToLessonElement(el: HTMLElement): boolean {
  // Headings and paragraphs are not focusable by default; -1 keeps them out of
  // the tab order while letting focus be placed on them.
  const addedTabIndex = !el.hasAttribute("tabindex");
  if (addedTabIndex) el.setAttribute("tabindex", "-1");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  return addedTabIndex;
}

/**
 * Bring the target into view, mark it, and move focus to it. Returns a
 * function that removes the mark.
 */
export function revealReviewTarget(el: HTMLElement): () => void {
  el.setAttribute("data-review-target", "");
  const addedTabIndex = goToLessonElement(el);

  return () => {
    el.removeAttribute("data-review-target");
    if (addedTabIndex) el.removeAttribute("tabindex");
  };
}
