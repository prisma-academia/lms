import { Extension, Node, generateHTML, generateJSON, type Extensions } from "@tiptap/core";
import { sanitizeHtml } from "@/lib/content/sanitize-html";

/**
 * Teaching the visual editor about designed lessons.
 *
 * The editor only knows prose: paragraphs, headings, lists, tables. A lesson
 * from the AI builder (or pasted from a designed page) is more than that —
 * callouts, cards, a chart, a diagram. Opened in an editor that does not know
 * those, every one of them is silently flattened to plain paragraphs the first
 * time the author types a character, and the lesson they save is not the
 * lesson they opened.
 *
 * Three pieces stop that, from most to least editable:
 *
 *  1. `LessonContainer` — boxes whose insides ARE ordinary prose (objectives,
 *     key points, callouts, cards). The box is kept; what is in it is edited
 *     like anything else.
 *  2. `BlockClasses` — a class on an ordinary element (`p.lesson-lead`,
 *     `ol.lesson-steps`) survives, so the element stays the block it was.
 *  3. `DesignedBlock` — everything the editor has no model for (a chart, a
 *     diagram, an accordion, a definition list, embedded media). Kept exactly
 *     as written and shown as it will look, but edited in the HTML view.
 *
 * And for anything none of them covers, `visualEditorLosses` says so before
 * the author's content is touched — see the guard in rich-text-editor.tsx.
 */

/** Boxes with ordinary prose inside; anything else with a block class is kept verbatim. */
const EDITABLE_CONTAINERS = [
  "aside.lesson-objectives",
  "aside.lesson-keypoints",
  "aside.lesson-callout",
  "div.lesson-cards",
  "section.lesson-card",
].join(", ");

const CONTAINER_TAGS = new Set(["aside", "div", "section"]);

export const LessonContainer = Node.create({
  name: "lessonContainer",
  group: "block",
  content: "block+",
  defining: true,
  // Ahead of DesignedBlock, which would otherwise claim every <aside>.
  priority: 1100,

  addAttributes() {
    return {
      tag: { default: "aside", rendered: false },
      class: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: EDITABLE_CONTAINERS,
        priority: 110,
        getAttrs: (element) => ({
          tag: element.tagName.toLowerCase(),
          class: element.getAttribute("class"),
        }),
      },
    ];
  },

  renderHTML({ node }) {
    const tag = CONTAINER_TAGS.has(node.attrs.tag) ? (node.attrs.tag as string) : "aside";
    return [tag, node.attrs.class ? { class: node.attrs.class as string } : {}, 0];
  },
});

/** Keep `class` on the ordinary elements a block can be made from. */
export const BlockClasses = Extension.create({
  name: "blockClasses",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "orderedList", "bulletList", "heading"],
        attributes: {
          class: {
            default: null,
            parseHTML: (element) => element.getAttribute("class"),
            renderHTML: (attributes) => (attributes.class ? { class: attributes.class as string } : {}),
          },
        },
      },
    ];
  },
});

/** What the editor cannot model, and so must carry through untouched. */
const VERBATIM = [
  "aside",
  "figure",
  "dl",
  "details",
  "svg",
  "iframe",
  "video",
  "audio",
  "table[class*='lesson-']",
  "blockquote[class*='lesson-']",
  "div[class*='lesson-']",
  "section[class*='lesson-']",
].join(", ");

/**
 * The stored markup as an element that is safe to put in this page.
 *
 * This runs in the staff admin, on the same origin as everything a staff
 * session can do, and the markup may have come from an import or a paste. So
 * it is sanitized before it becomes DOM — exactly as it is for a learner — and
 * built inside a <template>, whose contents are inert until moved out.
 */
const sanitizedCache = new Map<string, string>();
function safeElement(html: string): HTMLElement | null {
  let clean = sanitizedCache.get(html);
  if (clean === undefined) {
    clean = sanitizeHtml(html);
    if (sanitizedCache.size > 200) sanitizedCache.clear();
    sanitizedCache.set(html, clean);
  }
  const template = document.createElement("template");
  template.innerHTML = clean;
  const element = template.content.firstElementChild;
  // A fresh node every time: the serializer and the editing view each need
  // their own, and one element cannot be in two documents.
  return element instanceof HTMLElement || element instanceof SVGElement
    ? (element.cloneNode(true) as HTMLElement)
    : null;
}

export const DesignedBlock = Node.create({
  name: "designedBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  priority: 1000,

  addAttributes() {
    return { html: { default: "", rendered: false } };
  },

  parseHTML() {
    return [
      {
        tag: VERBATIM,
        priority: 100,
        getAttrs: (element) => ({ html: element.outerHTML }),
      },
    ];
  },

  renderHTML({ node }) {
    const element = safeElement(node.attrs.html as string);
    // Nothing survived sanitizing: keep a visible, harmless placeholder rather
    // than a node that renders as nothing and cannot be selected or removed.
    return element ?? ["p", {}, ""];
  },
});

/* -------------------------------------------------------------------------- */
/* Would the visual editor lose anything?                                      */
/* -------------------------------------------------------------------------- */

const COUNTED: { pattern: RegExp; what: string }[] = [
  { pattern: /<style[\s>]/gi, what: "the lesson's own styles" },
  { pattern: /<svg[\s>]/gi, what: "diagrams" },
  { pattern: /<(?:iframe|video|audio)[\s>]/gi, what: "embedded media" },
  { pattern: /<img[\s>]/gi, what: "images" },
  { pattern: /<table[\s>]/gi, what: "tables" },
  { pattern: /<(?:details|dl|figure|aside)[\s>]/gi, what: "designed blocks" },
  { pattern: /class="[^"]*\blesson-[a-z-]+/gi, what: "designed blocks" },
  { pattern: /\sstyle="/gi, what: "inline styling" },
];

function count(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0;
}

function textLength(html: string): number {
  return html.replace(/<style[\s\S]*?<\/style\s*>/gi, "").replace(/<[^>]*>/g, "").replace(/\s+/g, "").length;
}

/**
 * What would be missing if `html` went through the visual editor and back.
 * Empty when the round trip is safe. Pure: the live editor is not touched.
 */
export function visualEditorLosses(html: string, extensions: Extensions): string[] {
  if (!html.trim()) return [];

  let output: string;
  try {
    output = generateHTML(generateJSON(html, extensions), extensions);
  } catch {
    // If it cannot even be parsed into the editor's model, it cannot be edited there.
    return ["content the visual editor cannot read"];
  }

  const lost = new Set<string>();
  for (const { pattern, what } of COUNTED) {
    if (count(output, pattern) < count(html, pattern)) lost.add(what);
  }
  // Allow for the entities and whitespace the two serializers spell differently.
  if (textLength(output) < textLength(html) * 0.97) lost.add("some of the text");
  return [...lost];
}
