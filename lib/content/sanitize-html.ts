import sanitize from "sanitize-html";
import {
  sanitizeAndScopeCss,
  sanitizeDeclarations,
  scopeSelectorFor,
} from "./sanitize-css";

/**
 * Sanitize lesson and site-block HTML for storage and rendering.
 * Applied both when persisting HTML lesson content (builder apply route)
 * and when rendering it to learners — never trust stored contentJson.html.
 *
 * Deliberately parser-based (`sanitize-html`) rather than DOMPurify: DOMPurify
 * needs a DOM, and the isomorphic build pulls jsdom into every server bundle
 * that touches this module — including the tenant landing page, where jsdom's
 * CJS/ESM graph fails to load on Vercel.
 */

/** Structural + text tags. No script/style/iframe/form/object/embed. */
const ALLOWED_TAGS = [
  "p", "br", "hr", "div", "span", "section", "article", "header", "footer",
  "main", "aside", "nav",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "del", "ins", "mark", "small", "sub", "sup",
  "blockquote", "q", "cite", "abbr", "address", "time",
  "code", "pre", "kbd", "samp", "var",
  "ul", "ol", "li", "dl", "dt", "dd",
  "a", "img", "picture", "source", "figure", "figcaption",
  "audio", "video", "track",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "details", "summary",
];

/**
 * `style` is allowed, but never as written: the `*` transform below runs every
 * declaration through `sanitizeDeclarations` first, so what reaches this filter
 * has already had `expression()`, `behavior:` and non-http/data `url()` removed.
 * Allowing the attribute without that transform would reopen the CSS injection
 * surface this list used to close by dropping it outright.
 */
const ALLOWED_ATTRIBUTES: sanitize.IOptions["allowedAttributes"] = {
  "*": ["class", "id", "dir", "lang", "title", "role", "style", "aria-*", "data-*"],
  a: ["href", "name", "target", "rel"],
  img: ["src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding"],
  source: ["src", "srcset", "sizes", "type", "media"],
  audio: ["src", "controls", "preload", "loop", "muted"],
  video: ["src", "poster", "controls", "preload", "loop", "muted", "playsinline", "width", "height"],
  track: ["src", "kind", "srclang", "label", "default"],
  td: ["colspan", "rowspan", "headers"],
  th: ["colspan", "rowspan", "headers", "scope"],
  col: ["span"],
  colgroup: ["span"],
  ol: ["start", "type", "reversed"],
  time: ["datetime"],
  details: ["open"],
};

/**
 * Exported so `sanitize-site-document.ts` can reuse the exact same allowlist.
 * A site page that sanitized differently from a lesson body would be a second
 * security policy to keep in sync, which is how the two drift apart.
 */
export const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowedSchemesAppliedToAttributes: ["href", "src", "srcset", "cite"],
  allowProtocolRelative: false,
  // Drop the contents of stripped tags, not just their markup, so a removed
  // <script> can't leave its source behind as visible text.
  nonTextTags: ["script", "style", "textarea", "noscript", "option"],
  transformTags: {
    // One `*` handler rather than a per-tag map: sanitize-html picks exactly one
    // transform per tag (`transformTags[name] ?? transformTags['*']`), so a
    // separate `a` entry here would silently opt anchors out of style cleaning.
    "*": (tagName, attribs) => {
      const next = { ...attribs };

      if (next.style) {
        const cleaned = sanitizeDeclarations(next.style);
        if (cleaned) next.style = cleaned;
        else delete next.style;
      }

      // External links opened in a new tab must not hand over window.opener.
      if (tagName === "a" && next.target) next.rel = "noopener noreferrer";

      return { tagName, attribs: next };
    },
  },
};

export function sanitizeHtml(html: string): string {
  return sanitize(html, SANITIZE_OPTIONS);
}

/** `<style>…</style>` bodies, which the tag sanitizer strips before we see them. */
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;

export type ScopedHtml = {
  /** Sanitized markup, with `<style>` blocks removed. */
  html: string;
  /** Sanitized + scoped CSS lifted out of those blocks. Empty when there was none. */
  css: string;
  /** Value for the container's `data-css-scope` attribute. Always set. */
  scope: string;
};

/**
 * Sanitize author HTML that may carry its own `<style>` block.
 *
 * `sanitizeHtml` drops `<style>` entirely — correct for a fragment rendered into
 * a shared page, but it is why a pasted landing-page block rendered as unstyled
 * text. This lifts the CSS out instead, sanitizes it, and rewrites every
 * selector to sit under `[data-css-scope="<id>"]`, so the block styles itself
 * and cannot reach the nav, the admin chrome, or the block below it.
 *
 * The caller must put `data-css-scope={scope}` on the element wrapping `html`,
 * and render `css` inside a `<style>` element. Rendering `html` without the
 * attribute is not unsafe, only unstyled.
 */
export function sanitizeHtmlWithStyles(html: string, id: string): ScopedHtml {
  const { attribute, selector } = scopeSelectorFor(id);

  const collected: string[] = [];
  const withoutStyles = html.replace(STYLE_BLOCK, (_match, body: string) => {
    collected.push(body);
    return "";
  });

  return {
    html: sanitize(withoutStyles, SANITIZE_OPTIONS),
    css: collected.length > 0 ? sanitizeAndScopeCss(collected.join("\n"), selector) : "",
    scope: attribute,
  };
}
