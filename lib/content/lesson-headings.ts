// Sibling/relative imports only: the AI lesson writer imports this module too.
import { parseLessonText, type Inline } from "../courses/lesson-markdown";

/**
 * Stable anchors for the headings inside a lesson.
 *
 * A quiz question can point at "the heading this was taught under", and a
 * learner who gets it wrong is sent there. That only works if a heading has an
 * id that (a) exists, (b) is unique in the lesson, and (c) does not change when
 * the lesson is saved again — so the rule here is strict: an id a heading
 * already has is never altered, and new ids are only ever added.
 *
 * Ids are derived from the heading's text, so the same lesson gets the same ids
 * whether they are assigned when it is saved or when it is shown. That lets a
 * lesson written before any of this existed be linked to without a migration.
 *
 * Pure string work — no DOM, no HTML parser — so it runs on the server, in the
 * browser, and inside the AI workflow alike.
 */

export type LessonHeading = {
  id: string;
  text: string;
  level: number;
  /**
   * Inside a callout, example or disclosure (`aside`, `figure`, `details`).
   * "Key points" and "By the end of this lesson" are headings, but they are
   * furniture: nobody should be sent to one to read up on a question, and they
   * do not belong in a table of contents.
   */
  nested: boolean;
};

/** Generated ids carry this so they cannot collide with an id the app itself uses. */
const PREFIX = "sec-";

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/**
 * Hands out ids for headings in document order, never the same one twice.
 * `reserve` marks ids that already exist in the document so a generated id
 * cannot land on one of them.
 */
export function createHeadingIdAllocator(reserved: Iterable<string> = []) {
  const used = new Set<string>(reserved);
  let unnamed = 0;
  return (text: string): string => {
    const base = `${PREFIX}${slug(text) || `section-${++unnamed}`}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
}

type FoundHeading = {
  level: number;
  /** Offset of the opening tag, and of the first character after it. */
  openStart: number;
  openEnd: number;
  attrs: string;
  text: string;
  nested: boolean;
};

const TAG = /<(\/?)(aside|figure|details|h[2-4])\b([^>]*)>/gi;
const ID_ATTR = /(\s)id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/** Every h2–h4 in the document, with whether it sits inside a callout-like block. */
function findHeadings(html: string): FoundHeading[] {
  const found: FoundHeading[] = [];
  let depth = 0;
  TAG.lastIndex = 0;

  for (let match = TAG.exec(html); match; match = TAG.exec(html)) {
    const closing = match[1] === "/";
    const name = match[2].toLowerCase();

    if (!name.startsWith("h")) {
      depth = closing ? Math.max(0, depth - 1) : depth + 1;
      continue;
    }
    if (closing) continue;

    const openEnd = match.index + match[0].length;
    const close = new RegExp(`</${name}\\s*>`, "i").exec(html.slice(openEnd));
    // An unclosed heading has no knowable text; leave it alone.
    if (!close) continue;

    found.push({
      level: Number(name[1]),
      openStart: match.index,
      openEnd,
      attrs: match[3],
      text: plain(html.slice(openEnd, openEnd + close.index)),
      nested: depth > 0,
    });
    // Skip the heading's own contents: nothing in there is another heading.
    TAG.lastIndex = openEnd + close.index + close[0].length;
  }

  return found;
}

function existingId(attrs: string): string | null {
  const match = ID_ATTR.exec(` ${attrs}`);
  if (!match) return null;
  return (match[2] ?? match[3] ?? match[4] ?? "").trim() || null;
}

/** The id each found heading should carry, in order. Existing unique ids are kept. */
function assignIds(headings: FoundHeading[]): string[] {
  // Reserve every id already present before generating any, so a new id can
  // never take one that a later heading already owns. First occurrence wins.
  const kept = new Map<number, string>();
  const reserved = new Set<string>();
  headings.forEach((heading, index) => {
    const id = existingId(heading.attrs);
    if (id && !reserved.has(id)) {
      reserved.add(id);
      kept.set(index, id);
    }
  });

  const allocate = createHeadingIdAllocator(reserved);
  return headings.map((heading, index) => kept.get(index) ?? allocate(heading.text));
}

/**
 * Return `html` with an `id` on every h2–h4.
 *
 * Idempotent, and conservative: a heading that already has a usable id is
 * returned byte-for-byte unchanged. Only a missing id is added, and only a
 * duplicate or empty one is replaced (it could not be linked to anyway).
 */
export function withHeadingIds(html: string): string {
  const headings = findHeadings(html);
  if (headings.length === 0) return html;
  const ids = assignIds(headings);

  let out = "";
  let cursor = 0;
  headings.forEach((heading, index) => {
    const id = ids[index];
    const tag = html.slice(heading.openStart, heading.openEnd);
    let next = tag;

    if (existingId(heading.attrs) !== id) {
      next = ID_ATTR.test(` ${heading.attrs}`)
        ? tag.replace(/(\s)id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/i, `$1id="${id}"`)
        : tag.replace(/\s*(\/?)>$/, ` id="${id}"$1>`);
    }

    out += html.slice(cursor, heading.openStart) + next;
    cursor = heading.openEnd;
  });
  return out + html.slice(cursor);
}

/** The headings of an HTML lesson, with the ids `withHeadingIds` gives them. */
export function htmlHeadings(html: string): LessonHeading[] {
  const headings = findHeadings(html);
  const ids = assignIds(headings);
  return headings
    .map((heading, index) => ({ id: ids[index], text: heading.text, level: heading.level, nested: heading.nested }))
    .filter((heading) => heading.text);
}

function inlineText(content: Inline[]): string {
  return content
    .map((part) => part.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The headings of a plain-text (light markdown) lesson.
 *
 * Text lessons have nowhere to store an id, so theirs are derived from the
 * heading text every time. `renderLessonText` uses the same allocator in the
 * same order, which is what makes these ids match what is on the page.
 */
export function textHeadings(body: string): LessonHeading[] {
  const allocate = createHeadingIdAllocator();
  const headings: LessonHeading[] = [];
  for (const block of parseLessonText(body)) {
    if (block.kind !== "heading") continue;
    const text = inlineText(block.content);
    headings.push({ id: allocate(text), text, level: block.level, nested: false });
  }
  return headings.filter((heading) => heading.text);
}

/** Headings for whatever kind of lesson this is; empty for anything without prose. */
export function lessonHeadingsOf(contentType: string, contentJson: unknown): LessonHeading[] {
  if (!contentJson || typeof contentJson !== "object") return [];
  const json = contentJson as Record<string, unknown>;
  if (contentType === "HTML" && typeof json.html === "string") return htmlHeadings(json.html);
  if (contentType === "TEXT" && typeof json.body === "string") return textHeadings(json.body);
  return [];
}

/** The headings worth linking to or listing: those that head a section of the lesson. */
export function sectionHeadings(headings: LessonHeading[]): LessonHeading[] {
  return headings.filter((heading) => !heading.nested);
}

function comparable(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Find a heading by the text someone quoted for it. Used to turn "the heading
 * the AI said this question came from" into a real anchor; tolerant of case and
 * punctuation because a model's copy of a heading is rarely byte-exact.
 */
export function findHeadingByText(headings: LessonHeading[], text: string): LessonHeading | null {
  const wanted = comparable(text);
  if (!wanted) return null;
  const sections = sectionHeadings(headings);
  return (
    sections.find((heading) => comparable(heading.text) === wanted) ??
    headings.find((heading) => comparable(heading.text) === wanted) ??
    null
  );
}
