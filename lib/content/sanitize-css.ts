/**
 * CSS sanitizer + scoper for author-supplied HTML blocks.
 *
 * Site pages and HTML lessons are written by tenant admins, who paste real
 * markup — landing pages exported from a builder, email templates, snippets
 * from a template site. All of that carries CSS, either as a `<style>` block or
 * as `style="…"` attributes, and until this module existed every byte of it was
 * dropped on the floor, so the block rendered as unstyled text.
 *
 * Two jobs, deliberately separate:
 *
 *  1. SANITIZE. CSS can execute script in a handful of legacy/obscure ways, and
 *     can phone home. `expression()`, `behavior:`, `-moz-binding:`, and any
 *     `url()` whose scheme isn't http/https/data are removed. `@import` is
 *     dropped outright — it both loads remote code and leaks the visitor's IP
 *     and referrer to a third party on every page view.
 *
 *  2. SCOPE. Every selector is rewritten to sit under the block's own container,
 *     so a page that ships `body { background: black }` or `a { color: red }`
 *     restyles its own block and nothing else. Without this, one pasted snippet
 *     could restyle the admin chrome, the nav, or another block on the page —
 *     the kind of breakage that looks like a platform bug, not a content bug.
 *
 * This is not a CSS parser in the spec sense. It is a brace/paren-aware
 * tokenizer, which is enough because the output only has to be SAFE and SCOPED,
 * not canonical: anything it cannot confidently understand it drops.
 */

/** Declarations that can run script or load remote code, in any casing. */
const BANNED_PROPERTIES = new Set([
  "behavior",
  "-moz-binding",
  "binding",
]);

/** Schemes a `url()` may reference. Anything else (javascript:, vbscript:) goes. */
const SAFE_URL_SCHEME = /^(?:https?:|data:image\/|\/|\.\/|\.\.\/|#)/i;

/** At-rules whose body is a nested list of rules that must be scoped in turn. */
const NESTED_AT_RULES = new Set(["media", "supports", "container", "layer", "scope"]);

/**
 * At-rules whose body is declarations or keyframe stops rather than selectors.
 * Kept verbatim (after declaration sanitizing) — scoping `from`/`to` or a
 * `@font-face` body would break them.
 */
const FLAT_AT_RULES = new Set([
  "keyframes",
  "-webkit-keyframes",
  "font-face",
  "page",
  "counter-style",
  "property",
]);

/** At-rules that are dropped whole. `@import` loads remote CSS and leaks referrers. */
const BANNED_AT_RULES = new Set(["import", "charset", "namespace", "document"]);

/** Strip comments. Done first so `/* *​/` can't hide a banned token from the scanner. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

/**
 * True when a declaration value tries to execute or fetch something it
 * shouldn't. Checked on the value with whitespace collapsed, so
 * `expression ( … )` and `url( javascript:… )` don't slip through.
 */
function valueIsUnsafe(value: string): boolean {
  // A stylesheet is emitted inside a <style> element, whose content model ends
  // at the first `</style>`. `content: "</style><script>…"` is otherwise a
  // perfectly ordinary declaration, and would break straight out into markup.
  // No legitimate declaration needs `<`, so the whole declaration goes.
  if (value.includes("<")) return true;

  const flat = value.replace(/\s+/g, "").toLowerCase();
  if (flat.includes("expression(")) return true;
  if (/(?:javascript|vbscript|data:text\/html):/i.test(flat)) return true;

  for (const match of value.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) {
    const target = match[2].trim();
    if (target && !SAFE_URL_SCHEME.test(target)) return true;
  }
  return false;
}

/**
 * Sanitize a declaration list (`color: red; behavior: url(x)`) and return the
 * survivors. Also used for the `style` attribute, which is the same grammar.
 */
export function sanitizeDeclarations(input: string): string {
  const out: string[] = [];

  for (const raw of splitTopLevel(stripComments(input), ";")) {
    const decl = raw.trim();
    if (!decl) continue;

    const colon = decl.indexOf(":");
    if (colon <= 0) continue;

    const property = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).trim();
    if (!property || !value) continue;

    // A property name is an identifier. Anything else is a parse failure on our
    // side or an attack on theirs; either way it does not belong in the output.
    if (!/^-{0,2}[a-z][a-z0-9-]*$/.test(property)) continue;
    if (BANNED_PROPERTIES.has(property)) continue;
    if (valueIsUnsafe(value)) continue;

    out.push(`${property}: ${value}`);
  }

  return out.join("; ");
}

/**
 * Split on `sep`, ignoring separators nested inside (), [], {} or quotes.
 * `background: url(a;b)` and `[title="a,b"]` both need this.
 */
function splitTopLevel(input: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (quote) {
      if (ch === quote && input[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === sep && depth === 0) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(input.slice(start));
  return parts;
}

/**
 * Rewrite one selector so it can only match inside the block.
 *
 * Page-level selectors (`html`, `body`, `:root`, `*`) become the scope element
 * itself rather than a descendant of it — a pasted page whose background lives
 * on `body` should paint the block, not nothing at all. `:root` custom
 * properties therefore still cascade to the block's subtree, which is how most
 * pasted stylesheets expect to work.
 */
function scopeSelector(selector: string, scope: string): string | null {
  const trimmed = selector.trim();
  if (!trimmed) return null;

  // Markup characters cannot appear in a selector, and `<` in particular would
  // let the emitted stylesheet close its own <style> element. `>` is excluded
  // from this check on purpose — it is the child combinator, not markup.
  if (/[{}<;]/.test(trimmed)) return null;

  const rootOnly = /^(?::root|html|body|\*)$/i;
  if (rootOnly.test(trimmed)) return scope;

  // Leading page-level selector: `body .card` → `<scope> .card`.
  const leadingRoot = /^(?::root|html|body)\b\s*/i;
  if (leadingRoot.test(trimmed)) {
    const rest = trimmed.replace(leadingRoot, "").trim();
    return rest ? `${scope} ${rest}` : scope;
  }

  return `${scope} ${trimmed}`;
}

/** Scope a full comma-separated selector list, dropping any part we reject. */
function scopeSelectorList(selectorList: string, scope: string): string | null {
  const scoped = splitTopLevel(selectorList, ",")
    .map((s) => scopeSelector(s, scope))
    .filter((s): s is string => s !== null);
  return scoped.length > 0 ? scoped.join(", ") : null;
}

type Rule = { prelude: string; body: string; hasBody: boolean };

/**
 * Split a stylesheet into top-level rules. Brace-counting only — enough to
 * separate `selector { … }` and `@media … { … }` from each other, and to know
 * where a rule ended so a malformed one can be skipped whole.
 */
function readRules(css: string): Rule[] {
  const rules: Rule[] = [];
  let i = 0;

  while (i < css.length) {
    // Find the end of this rule's prelude: `{` opens a block, `;` ends a
    // statement at-rule like `@import url(x);`.
    let depth = 0;
    let quote: string | null = null;
    let braceStart = -1;
    let semi = -1;
    let j = i;

    for (; j < css.length; j++) {
      const ch = css[j];
      if (quote) {
        if (ch === quote && css[j - 1] !== "\\") quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === ";" && depth === 0) {
        semi = j;
        break;
      } else if (ch === "{" && depth === 0) {
        braceStart = j;
        break;
      }
    }

    if (braceStart === -1) {
      // Statement at-rule, or trailing garbage at end of input.
      const prelude = css.slice(i, semi === -1 ? css.length : semi).trim();
      if (prelude) rules.push({ prelude, body: "", hasBody: false });
      if (semi === -1) break;
      i = semi + 1;
      continue;
    }

    // Walk to the matching close brace.
    let braceDepth = 0;
    let end = -1;
    quote = null;
    for (let k = braceStart; k < css.length; k++) {
      const ch = css[k];
      if (quote) {
        if (ch === quote && css[k - 1] !== "\\") quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "{") braceDepth++;
      else if (ch === "}") {
        braceDepth--;
        if (braceDepth === 0) {
          end = k;
          break;
        }
      }
    }
    // Unbalanced braces: everything from here on is unparseable. Stop rather
    // than guess, so a truncated paste cannot emit a rule the author never wrote.
    if (end === -1) break;

    rules.push({
      prelude: css.slice(i, braceStart).trim(),
      body: css.slice(braceStart + 1, end),
      hasBody: true,
    });
    i = end + 1;
  }

  return rules;
}

/** Name of an at-rule prelude (`@media (min-width: 40em)` → `media`), or null. */
function atRuleName(prelude: string): string | null {
  const match = /^@([a-zA-Z-]+)/.exec(prelude.trim());
  return match ? match[1].toLowerCase() : null;
}

function transformRules(css: string, scope: string, depth: number): string {
  // Nested at-rules can legally nest, but not deeply. The cap makes a
  // pathological input cheap to reject instead of expensive to walk.
  if (depth > 8) return "";

  const out: string[] = [];

  for (const rule of readRules(css)) {
    // At-rule preludes (`@media (…)`, `@keyframes name`) are re-emitted
    // verbatim, so they get the same `<` ban as selectors and values —
    // otherwise `@media screen and (x:"</style>…")` closes the style element.
    if (rule.prelude.includes("<")) continue;

    const at = atRuleName(rule.prelude);

    if (at) {
      if (BANNED_AT_RULES.has(at)) continue;
      if (!rule.hasBody) continue;

      if (NESTED_AT_RULES.has(at)) {
        const inner = transformRules(rule.body, scope, depth + 1);
        if (inner.trim()) out.push(`${rule.prelude} { ${inner} }`);
        continue;
      }

      if (FLAT_AT_RULES.has(at)) {
        // @keyframes holds stop blocks (`from { … }`); @font-face holds plain
        // declarations. Both are already inert without a selector to scope.
        const inner = /\{/.test(rule.body)
          ? readRules(rule.body)
              .filter((r) => r.hasBody)
              .map((r) => `${r.prelude} { ${sanitizeDeclarations(r.body)} }`)
              .join(" ")
          : sanitizeDeclarations(rule.body);
        if (inner.trim()) out.push(`${rule.prelude} { ${inner} }`);
        continue;
      }

      // An at-rule we don't recognise. Dropping it is the safe default.
      continue;
    }

    if (!rule.hasBody) continue;

    const selector = scopeSelectorList(rule.prelude, scope);
    if (!selector) continue;

    const declarations = sanitizeDeclarations(rule.body);
    if (!declarations) continue;

    out.push(`${selector} { ${declarations} }`);
  }

  return out.join("\n");
}

/**
 * Sanitize a stylesheet and confine every rule in it to `scope`.
 *
 * `scope` must be a complete CSS selector for the block's container — this
 * function does not build or escape it. Use `scopeSelectorFor`.
 */
export function sanitizeAndScopeCss(css: string, scope: string): string {
  if (!css.trim()) return "";
  return transformRules(stripComments(css), scope, 0);
}

/**
 * The attribute selector a scoped stylesheet is anchored to, plus the attribute
 * value to put on the container. The token is reduced to `[A-Za-z0-9_-]` so it
 * can never close the attribute selector or the surrounding `<style>` element.
 */
export function scopeSelectorFor(id: string): { attribute: string; selector: string } {
  const token = id.replace(/[^A-Za-z0-9_-]/g, "") || "block";
  return { attribute: token, selector: `[data-css-scope="${token}"]` };
}
