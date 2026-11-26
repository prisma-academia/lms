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

/**
 * Structural + text tags. No script/style/form/object/embed.
 *
 * `iframe` is the one exception, and only ever for the video hosts named in
 * `allowedIframeHostnames` below. Without it an author who pastes a YouTube
 * embed into an HTML lesson or a site page watches it vanish on save with no
 * explanation — and the lesson-level VIDEO_URL player cannot help them, because
 * the video they want is in the middle of a page of prose. sanitize-html
 * enforces the hostname list itself; any other iframe is still dropped whole.
 */
/**
 * Inline SVG, for diagrams: shapes, text and gradients, and nothing else.
 *
 * What is NOT here is the point. `script` and event attributes are the obvious
 * ones; the rest are the quieter ways an SVG reaches outside itself:
 *
 *  - `foreignObject` embeds arbitrary HTML, re-opening everything the HTML
 *    allowlist closes;
 *  - `use` and `image` load other documents by URL (and `use` can pull in a
 *    remote SVG's scripts in older engines);
 *  - `a` inside SVG takes `href`/`xlink:href` — links here go through the HTML
 *    `a` rules instead, and `xlink:href` is allowed nowhere;
 *  - `style` inside SVG is a stylesheet for the WHOLE page, not the drawing;
 *  - `animate`/`set` can rewrite attributes (including `href`) over time;
 *  - `filter`, `mask`, `pattern`, `clipPath`, `marker` reference by URL and
 *    add a great deal of surface for very little diagram.
 *
 * Spelling: inside an `<svg>` the parser reports SVG's camelCase element names
 * as written (`linearGradient`, `foreignObject`), and lower-cases them
 * everywhere else — so the two gradient elements are listed both ways, and so
 * is `foreignObject` where its contents are discarded below. ATTRIBUTE names
 * are always lower-cased (`viewbox`); a browser reading the result restores
 * `viewBox` and friends itself (the HTML parser's SVG adjustment tables).
 */
const SVG_TAGS = [
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "defs", "stop",
  "linearGradient", "lineargradient", "radialGradient", "radialgradient",
];
const SVG_TAG_SET = new Set(SVG_TAGS);

/** Presentation attributes every SVG shape may carry. */
const SVG_PAINT = [
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity",
  "opacity", "transform",
];
/** The ones whose value is a paint, which may be a `url(#gradient)` reference. */
const SVG_PAINT_VALUES = ["fill", "stroke", "stop-color"];
const SVG_LINEAR_GRADIENT = ["x1", "y1", "x2", "y2", "gradientunits", "gradienttransform"];
const SVG_RADIAL_GRADIENT = ["cx", "cy", "r", "fx", "fy", "gradientunits", "gradienttransform"];
const SVG_TEXT = [
  "x", "y", "dx", "dy", "text-anchor", "dominant-baseline", "font-size", "font-weight",
  "font-style", "letter-spacing",
];

/**
 * A paint is a colour, a keyword, or a reference to a gradient IN THIS
 * document. `url(https://…)` would make the drawing fetch from wherever it
 * names; `url(#id)` cannot leave the page.
 */
function svgPaintIsSafe(value: string): boolean {
  const paint = value.trim();
  if (/[<>"'`\\;{}]/.test(paint)) return false;
  if (!/url\s*\(/i.test(paint)) return true;
  return /^url\(\s*#[A-Za-z][\w-]*\s*\)$/.test(paint);
}

const ALLOWED_TAGS = [
  "p", "br", "hr", "div", "span", "section", "article", "header", "footer",
  "main", "aside", "nav",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "del", "ins", "mark", "small", "sub", "sup",
  "blockquote", "q", "cite", "abbr", "address", "time",
  "code", "pre", "kbd", "samp", "var",
  "ul", "ol", "li", "dl", "dt", "dd",
  "a", "img", "picture", "source", "figure", "figcaption",
  "audio", "video", "track", "iframe",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "details", "summary",
  ...SVG_TAGS,
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
  iframe: [
    "src", "width", "height", "title", "loading", "allow", "allowfullscreen",
    "frameborder", "referrerpolicy",
  ],
  td: ["colspan", "rowspan", "headers"],
  th: ["colspan", "rowspan", "headers", "scope"],
  col: ["span"],
  colgroup: ["span"],
  ol: ["start", "type", "reversed"],
  time: ["datetime"],
  details: ["open"],

  // SVG. Geometry and paint only — no `href`, no `xlink:href`, no event
  // attributes, on any of them. (`id`, `class`, `role`, `aria-*` and a
  // sanitized `style` come from the `*` entry above.)
  svg: ["viewbox", "width", "height", "preserveaspectratio", "xmlns", ...SVG_PAINT],
  g: SVG_PAINT,
  path: ["d", ...SVG_PAINT],
  rect: ["x", "y", "width", "height", "rx", "ry", ...SVG_PAINT],
  circle: ["cx", "cy", "r", ...SVG_PAINT],
  ellipse: ["cx", "cy", "rx", "ry", ...SVG_PAINT],
  line: ["x1", "y1", "x2", "y2", ...SVG_PAINT],
  polyline: ["points", ...SVG_PAINT],
  polygon: ["points", ...SVG_PAINT],
  text: [...SVG_TEXT, ...SVG_PAINT],
  tspan: [...SVG_TEXT, ...SVG_PAINT],
  linearGradient: SVG_LINEAR_GRADIENT,
  lineargradient: SVG_LINEAR_GRADIENT,
  radialGradient: SVG_RADIAL_GRADIENT,
  radialgradient: SVG_RADIAL_GRADIENT,
  stop: ["offset", "stop-color", "stop-opacity"],
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
  // The only hosts an `iframe` may point at. Everything else is dropped —
  // an embed allowlist is what keeps this from being an arbitrary-page-
  // inclusion hole (clickjacking, credential-phishing overlays).
  allowedIframeHostnames: [
    "www.youtube.com",
    "youtube.com",
    "www.youtube-nocookie.com",
    "youtube-nocookie.com",
    "player.vimeo.com",
  ],
  allowProtocolRelative: false,
  // Drop the contents of stripped tags, not just their markup, so a removed
  // <script> can't leave its source behind as visible text.
  // `foreignObject` for the same reason: with the tag gone, the HTML it wrapped
  // must not be left behind inside the drawing. Both spellings — see SVG_TAGS.
  nonTextTags: [
    "script", "style", "textarea", "noscript", "option", "foreignObject", "foreignobject",
  ],
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

      if (SVG_TAG_SET.has(tagName)) {
        for (const name of SVG_PAINT_VALUES) {
          if (next[name] !== undefined && !svgPaintIsSafe(next[name])) delete next[name];
        }
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
