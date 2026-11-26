import { sanitizeHtmlWithStyles } from "@/lib/content/sanitize-html";
import {
  htmlHeadings,
  sectionHeadings,
  textHeadings,
  withHeadingIds,
} from "@/lib/content/lesson-headings";

/**
 * A lesson body, made ready to show — on the server.
 *
 * The learner's browser used to do this itself: it downloaded the HTML
 * sanitizer (a full parser), ran every lesson through it, and did so again on
 * each re-render. Doing it here means the learner's page receives markup that
 * is already safe and already carries its heading anchors, and the sanitizer
 * stays out of the learner bundle altogether.
 *
 * Stored lesson HTML is still never trusted: it is sanitized on every read,
 * here, exactly as it was sanitized on every render before.
 */

export type RenderedLesson = {
  /** Sanitized markup with an id on every h2–h4. */
  html: string;
  /** The lesson's own `<style>` blocks, sanitized and scoped to it. May be empty. */
  css: string;
  /** Value for `data-css-scope` on the element that wraps `html`. */
  scope: string;
};

/** A heading the learner can jump to from "On this page". */
export type OutlineEntry = { id: string; text: string; level: number };

export function renderLessonHtml(html: string, lessonId: string): RenderedLesson {
  const scoped = sanitizeHtmlWithStyles(html, lessonId);
  return {
    // Ids go on AFTER sanitizing, so they are derived from exactly the headings
    // that will be on the page. Ids already in the lesson are left untouched.
    html: withHeadingIds(scoped.html),
    css: scoped.css,
    scope: scoped.scope,
  };
}

/** Deepest heading level worth listing; below this an outline is just noise. */
const OUTLINE_MAX_LEVEL = 3;

function toOutline(headings: ReturnType<typeof htmlHeadings>): OutlineEntry[] {
  return sectionHeadings(headings)
    .filter((heading) => heading.level <= OUTLINE_MAX_LEVEL)
    .map((heading) => ({ id: heading.id, text: heading.text, level: heading.level }));
}

/** The outline of an HTML lesson, read from the markup that will be shown. */
export function htmlLessonOutline(renderedHtml: string): OutlineEntry[] {
  return toOutline(htmlHeadings(renderedHtml));
}

/** The outline of a plain-text lesson; ids match what `renderLessonText` puts on the page. */
export function textLessonOutline(body: string): OutlineEntry[] {
  return toOutline(textHeadings(body));
}
