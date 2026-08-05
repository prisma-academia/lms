import sanitize from "sanitize-html";

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

/** No `style` attribute anywhere — inline CSS is an injection surface. */
const ALLOWED_ATTRIBUTES: sanitize.IOptions["allowedAttributes"] = {
  "*": ["class", "id", "dir", "lang", "title", "role", "aria-*", "data-*"],
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

const OPTIONS: sanitize.IOptions = {
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
    // External links opened in a new tab must not hand over window.opener.
    a: (tagName, attribs) =>
      attribs.target
        ? { tagName, attribs: { ...attribs, rel: "noopener noreferrer" } }
        : { tagName, attribs },
  },
};

export function sanitizeHtml(html: string): string {
  return sanitize(html, OPTIONS);
}
