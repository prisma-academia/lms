import { findVariable } from "./variables";

/**
 * Reordering a page by its sections, without rewriting the page.
 *
 * A site page is HTML the author wrote, and the editor's promise is that it
 * stays what they wrote: their indentation, their comments, their odd but
 * deliberate markup. So nothing here parses the document into a tree and
 * prints it back. Every operation is a cut and paste of text ranges — moving a
 * section swaps two ranges and leaves every other byte where it was.
 *
 * A "section" is a top-level piece of the page body: an element, or a
 * top-level `{{#if}}` / `{{#each}}` block (which often wraps one). `<style>`
 * blocks, comments and loose text are not sections; they are skipped over and
 * stay put.
 *
 * Pure string work, so it runs in the editor and in the checks alike.
 */

export type SourceSection = {
  /** Position among the page's sections, from 0. */
  index: number;
  /** Offsets into the source: `source.slice(start, end)` is the section. */
  start: number;
  end: number;
  /** Lower-case tag name, or "block" for a top-level template block. */
  tag: string;
  /** What to call it in the outline. */
  label: string;
};

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);
/** Elements whose content is text, not markup: a `<` inside is not a tag. */
const RAW_TEXT = new Set(["style", "script", "textarea", "title"]);
/** Top-level elements that are part of the document, not of the page. */
const NOT_A_SECTION = new Set(["style", "script", "link", "meta", "title", "head", "base"]);

/** Offset just past the `>` that closes the tag starting at `at`, minding quoted attribute values. */
function tagEnd(source: string, at: number): number {
  let quote: string | null = null;
  for (let i = at + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i + 1;
    }
  }
  return source.length;
}

const TAG_NAME = /^<(\/?)([a-zA-Z][\w:-]*)/;

/**
 * Offset just past the element that opens at `start`.
 *
 * Tolerant on purpose: a stray closing tag is ignored, and a closing tag for
 * an outer element closes everything inside it — hand-written HTML is rarely
 * perfectly balanced. If the element never closes, it runs to the end.
 */
function elementEnd(source: string, lower: string, start: number): number {
  const open: string[] = [];
  let i = start;
  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt < 0) return source.length;

    if (source.startsWith("<!--", lt)) {
      const close = source.indexOf("-->", lt + 4);
      i = close < 0 ? source.length : close + 3;
      continue;
    }

    const match = TAG_NAME.exec(source.slice(lt, lt + 64));
    if (!match) {
      i = lt + 1;
      continue;
    }

    const end = tagEnd(source, lt);
    const name = match[2].toLowerCase();

    if (match[1]) {
      const at = open.lastIndexOf(name);
      if (at >= 0) open.length = at;
      if (open.length === 0) return end;
    } else if (VOID.has(name) || source[end - 2] === "/") {
      if (open.length === 0) return end;
    } else if (RAW_TEXT.has(name)) {
      const close = lower.indexOf(`</${name}`, end);
      if (close < 0) return source.length;
      const closeEnd = tagEnd(source, close);
      if (open.length === 0) return closeEnd;
      i = closeEnd;
      continue;
    } else {
      open.push(name);
    }
    i = end;
  }
  return source.length;
}

const BLOCK_OPEN = /^\{\{\s*#(if|each)\b\s*([^}]*?)\s*\}\}/;
const BLOCK_TAG = /\{\{\s*(#(?:if|each)\b[^}]*|\/(?:if|each))\s*\}\}/g;

/** Offset just past the `{{/if}}` or `{{/each}}` that closes the block opening at `start`. */
function blockEnd(source: string, start: number): number {
  BLOCK_TAG.lastIndex = start;
  let depth = 0;
  for (let match = BLOCK_TAG.exec(source); match; match = BLOCK_TAG.exec(source)) {
    if (match[1].startsWith("#")) depth++;
    else if (--depth === 0) return match.index + match[0].length;
  }
  return source.length;
}

function plain(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    // A heading that is only a variable reads as that variable's name:
    // "{{ tenant.name }}" becomes "Organisation name". A loop's own fields
    // (`this.title`) name nothing on their own and are dropped.
    .replace(/\{\{\s*([\w.@]+)\s*\}\}/g, (_tag, path: string) =>
      path.startsWith("this.") || path.startsWith("@") ? " " : (findVariable(path)?.label ?? path)
    )
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HEADING = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]\s*>/i;
const ATTRIBUTE = (name: string) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i");

function labelFor(chunk: string, tag: string): string {
  if (tag === "block") {
    const open = BLOCK_OPEN.exec(chunk);
    const subject = open ? (findVariable(open[2])?.label ?? open[2]) : "";
    const inner = HEADING.exec(chunk);
    const about = inner ? plain(inner[1]) : "";
    const lead = open?.[1] === "each" ? `For each: ${subject}` : `Only if: ${subject}`;
    return about ? `${lead} — ${about}` : lead;
  }

  const clip = (text: string) => (text.length > 60 ? `${text.slice(0, 57)}…` : text);

  // Its heading, if it has one that says something.
  const heading = HEADING.exec(chunk);
  const title = heading ? plain(heading[1]) : "";
  if (title) return clip(title);

  const openTag = chunk.slice(0, tagEnd(chunk, 0));
  const labelled = ATTRIBUTE("aria-label").exec(openTag)?.[1];
  if (labelled) return clip(labelled);

  // A list of something: name what it lists.
  const loop = /\{\{\s*#each\s+([\w.]+)\s*\}\}/.exec(chunk);
  if (loop) return clip(`List: ${findVariable(loop[1])?.label ?? loop[1]}`);

  const form = ATTRIBUTE("data-lms-form").exec(chunk)?.[1];
  if (form) return `Form: ${form}`;

  // Otherwise the words it starts with.
  const text = plain(chunk.replace(/<style[\s\S]*?<\/style\s*>/gi, " "));
  if (text) return clip(text);

  const named = ATTRIBUTE("id").exec(openTag)?.[1] ?? ATTRIBUTE("class").exec(openTag)?.[1]?.split(/\s+/)[0];
  return named ?? tag;
}

/** The range of the source that holds the page body: inside `<body>` when there is one. */
function bodyRange(source: string, lower: string): { from: number; to: number } {
  const open = /<body\b/i.exec(source);
  if (!open) return { from: 0, to: source.length };
  const from = tagEnd(source, open.index);
  const close = lower.lastIndexOf("</body");
  return { from, to: close > from ? close : source.length };
}

type Range = { start: number; end: number; tag: string };

/** Elements that are often just a wrapper around the real sections of a page. */
const WRAPPERS = new Set(["div", "main", "article"]);

/**
 * The page's sections, in document order.
 *
 * Top-level pieces of the body — unless the whole page is one wrapper
 * (`<div class="wrap">…</div>`, `<main>…</main>`), in which case the sections
 * are the pieces inside it. Without that, a page written the common way would
 * be a single unmovable "section".
 */
export function listSections(source: string): SourceSection[] {
  const lower = source.toLowerCase();
  const { from, to } = bodyRange(source, lower);
  let ranges = scanRange(source, lower, from, to);

  if (ranges.length === 1 && WRAPPERS.has(ranges[0].tag)) {
    const wrapper = ranges[0];
    const innerFrom = tagEnd(source, wrapper.start);
    const innerTo = lower.lastIndexOf(`</${wrapper.tag}`, wrapper.end - 1);
    if (innerTo > innerFrom) {
      const inner = scanRange(source, lower, innerFrom, innerTo);
      if (inner.length >= 2) ranges = inner;
    }
  }

  return ranges.map((range, index) => ({
    index,
    ...range,
    label: labelFor(source.slice(range.start, range.end), range.tag),
  }));
}

/** The sections directly inside one stretch of the source. */
function scanRange(source: string, lower: string, from: number, to: number): Range[] {
  const sections: Range[] = [];

  const add = (start: number, end: number, tag: string) => {
    const bounded = Math.min(end, to);
    if (bounded <= start) return;
    sections.push({ start, end: bounded, tag });
  };

  let i = from;
  while (i < to) {
    const ch = source[i];
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      i++;
      continue;
    }

    if (source.startsWith("{{", i)) {
      if (BLOCK_OPEN.test(source.slice(i, i + 200))) {
        const end = blockEnd(source, i);
        add(i, end, "block");
        i = Math.max(end, i + 2);
      } else {
        const close = source.indexOf("}}", i);
        i = close < 0 ? to : close + 2;
      }
      continue;
    }

    if (ch === "<") {
      if (source.startsWith("<!--", i)) {
        const close = source.indexOf("-->", i + 4);
        i = close < 0 ? to : close + 3;
        continue;
      }
      const match = TAG_NAME.exec(source.slice(i, i + 64));
      if (match && !match[1]) {
        const end = elementEnd(source, lower, i);
        const name = match[2].toLowerCase();
        if (!NOT_A_SECTION.has(name)) add(i, end, name);
        i = Math.max(end, i + 1);
      } else {
        // A doctype, or a closing tag with nothing open.
        i = tagEnd(source, i);
      }
      continue;
    }

    // Loose text between sections.
    const nextTag = source.indexOf("<", i);
    const nextBlock = source.indexOf("{{", i);
    const next = Math.min(nextTag < 0 ? to : nextTag, nextBlock < 0 ? to : nextBlock);
    i = next > i ? next : i + 1;
  }

  return sections;
}

/** Swap a section with its neighbour. Returns the source unchanged when it cannot move. */
export function moveSection(source: string, index: number, direction: -1 | 1): string {
  const sections = listSections(source);
  const a = sections[index];
  const b = sections[index + direction];
  if (!a || !b) return source;
  const [first, second] = a.start < b.start ? [a, b] : [b, a];
  return (
    source.slice(0, first.start) +
    source.slice(second.start, second.end) +
    // Whatever sat between the two — blank lines, a comment, a style block —
    // stays between them.
    source.slice(first.end, second.start) +
    source.slice(first.start, first.end) +
    source.slice(second.end)
  );
}

/** Insert a copy of a section directly after it. */
export function duplicateSection(source: string, index: number): string {
  const section = listSections(source)[index];
  if (!section) return source;
  // On its own lines, at the indentation of the section it copies.
  const lineStart = source.lastIndexOf("\n", section.start - 1) + 1;
  const indent = /^[ \t]*/.exec(source.slice(lineStart, section.start))?.[0] ?? "";
  return (
    source.slice(0, section.end) +
    "\n\n" +
    indent +
    source.slice(section.start, section.end) +
    source.slice(section.end)
  );
}

/**
 * Remove a section, together with the gap that separated it from its
 * neighbour — the blank line before it, or after it when it was first — so
 * deleting leaves the same spacing the page had, not a growing hole.
 */
export function deleteSection(source: string, index: number): string {
  const sections = listSections(source);
  const section = sections[index];
  if (!section) return source;

  const previous = sections[index - 1];
  if (previous) {
    const between = source.slice(previous.end, section.start);
    const lead = /[ \t\r\n]*$/.exec(between)?.[0].length ?? 0;
    return source.slice(0, section.start - lead) + source.slice(section.end);
  }

  // First on the page: take the gap after it instead, so the next section
  // moves up into its place (and inherits its indentation).
  const after = source.slice(section.end, sections[index + 1]?.start ?? source.length);
  const trail = /^\s*/.exec(after)?.[0].length ?? 0;
  return source.slice(0, section.start) + source.slice(section.end + (sections[index + 1] ? trail : 0));
}

/**
 * Insert markup as a new section.
 *
 * `after` is the index of the section to put it after; `-1` puts it first, and
 * `null` (or an index past the end) puts it last.
 */
export function insertSection(source: string, after: number | null, markup: string): string {
  const html = markup.trim();
  if (!html) return source;
  const sections = listSections(source);

  if (after === -1 && sections.length > 0) {
    const first = sections[0];
    return source.slice(0, first.start) + html + "\n\n" + source.slice(first.start);
  }

  const anchor = after === null ? sections[sections.length - 1] : (sections[after] ?? sections[sections.length - 1]);
  if (!anchor) {
    // A page with no sections yet: at the end of the body.
    const { to } = bodyRange(source, source.toLowerCase());
    const before = source.slice(0, to);
    const lead = before.trim().length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    return before + lead + html + "\n" + source.slice(to);
  }
  return source.slice(0, anchor.end) + "\n\n" + html + source.slice(anchor.end);
}
