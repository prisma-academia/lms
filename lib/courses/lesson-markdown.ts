/**
 * The "light markdown" subset TEXT lesson bodies are written in.
 *
 * TEXT lessons are described to authors — and to the AI course builder, in
 * `course-builder-agent.ts` — as "plain text / light markdown". Nothing ever
 * parsed that markdown: the learner's renderer handled backtick code spans and
 * nothing else, so every `## Heading`, `**bold**` and `- bullet` arrived as
 * literal punctuation. This module is the missing half of that promise.
 *
 * Deliberately a small hand-rolled subset rather than a markdown library. TEXT
 * content is not trusted to be markdown at all — most of it is prose that
 * happens to contain the occasional asterisk — so the rules here fire only on
 * unambiguous line-leading syntax and never rewrite ordinary punctuation.
 *
 * Parsing is separated from output because there are two consumers that must
 * agree: the learner's React renderer (`render-lesson-text.tsx`) and the
 * WYSIWYG editor, which needs the same content as an HTML string so a legacy
 * TEXT lesson can be opened for visual editing. One parser, two serializers —
 * rather than two parsers that drift.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "code"; text: string };

export type Block =
  | { kind: "heading"; level: 2 | 3 | 4 | 5; content: Inline[] }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "quote"; content: Inline[] }
  | { kind: "code"; code: string };

/** `**bold**`, `*italic*`/`_italic_`, `` `code` `` — inline, non-nesting. */
const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  for (const part of text.split(INLINE)) {
    if (!part) continue;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      out.push({ type: "strong", text: part.slice(2, -2) });
    } else if (part.length > 4 && part.startsWith("__") && part.endsWith("__")) {
      out.push({ type: "strong", text: part.slice(2, -2) });
    } else if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      out.push({ type: "code", text: part.slice(1, -1) });
    } else if (
      part.length > 2 &&
      ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_")))
    ) {
      out.push({ type: "em", text: part.slice(1, -1) });
    } else {
      out.push({ type: "text", text: part });
    }
  }
  return out;
}

const HEADING = /^(#{1,4})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^\s*```/;

export function parseLessonText(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  // Only one of these is ever non-empty; `flush` closes whichever it is before
  // a block of a different kind starts.
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let fence: string[] | null = null;

  function flush() {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", content: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
    if (list) {
      blocks.push({
        kind: "list",
        ordered: list.ordered,
        items: list.items.map(parseInline),
      });
      list = null;
    }
    if (quote.length) {
      blocks.push({ kind: "quote", content: parseInline(quote.join(" ")) });
      quote = [];
    }
  }

  for (const line of lines) {
    // A fenced block swallows everything verbatim until it closes, so markdown
    // inside a code sample is shown rather than interpreted.
    if (FENCE.test(line)) {
      if (fence) {
        blocks.push({ kind: "code", code: fence.join("\n") });
        fence = null;
      } else {
        flush();
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length + 1, 5) as 2 | 3 | 4 | 5;
      blocks.push({ kind: "heading", level, content: parseInline(heading[2]) });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      if (paragraph.length || quote.length) flush();
      // A numbered list starting mid-bullet-list is a new list, not a new item.
      if (list && list.ordered !== isOrdered) flush();
      if (!list) list = { ordered: isOrdered, items: [] };
      list.items.push((bullet ?? ordered)![1]);
      continue;
    }

    const quoted = QUOTE.exec(line);
    if (quoted) {
      if (paragraph.length || list) flush();
      quote.push(quoted[1]);
      continue;
    }

    if (list || quote.length) flush();
    paragraph.push(line.trim());
  }

  // An unterminated fence is still content; show it rather than drop it.
  if (fence) blocks.push({ kind: "code", code: fence.join("\n") });
  flush();

  return blocks;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineToHtml(content: Inline[]): string {
  return content
    .map((part) => {
      const text = escapeHtml(part.text);
      if (part.type === "strong") return `<strong>${text}</strong>`;
      if (part.type === "em") return `<em>${text}</em>`;
      if (part.type === "code") return `<code>${text}</code>`;
      return text;
    })
    .join("");
}

/**
 * Serialize to HTML, for handing a legacy TEXT lesson to the WYSIWYG editor.
 * Every value is escaped on the way through, so a body containing `<script>`
 * becomes visible text rather than markup — the same guarantee the React
 * renderer gives for free.
 */
export function lessonTextToHtml(text: string): string {
  return parseLessonText(text)
    .map((block) => {
      switch (block.kind) {
        case "heading":
          return `<h${block.level}>${inlineToHtml(block.content)}</h${block.level}>`;
        case "paragraph":
          return `<p>${inlineToHtml(block.content)}</p>`;
        case "quote":
          return `<blockquote>${inlineToHtml(block.content)}</blockquote>`;
        case "code":
          return `<pre><code>${escapeHtml(block.code)}</code></pre>`;
        case "list": {
          const tag = block.ordered ? "ol" : "ul";
          const items = block.items.map((i) => `<li>${inlineToHtml(i)}</li>`).join("");
          return `<${tag}>${items}</${tag}>`;
        }
      }
    })
    .join("\n");
}
