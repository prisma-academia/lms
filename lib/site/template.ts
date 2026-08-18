/**
 * The `{{ }}` template engine for site pages.
 *
 * Deliberately isomorphic and dependency-free: the admin editor imports it to
 * render the live preview in the browser, and `render-page.tsx` imports it to
 * render the real page on the server. Both must produce identical output, so
 * this module must never reach for Prisma, `node:` builtins, or the DOM.
 *
 * The syntax extends the `{{placeholder}}` convention already used by
 * certificates (`lib/certificates/design.ts`) and the email templates with the
 * two constructs a catalog page actually needs — a loop and a conditional:
 *
 *   {{ tenant.name }}                     scalar, HTML-escaped
 *   {{#each courses}} {{ this.title }} {{/each}}
 *   {{#if user.isAuthenticated}} … {{else}} … {{/if}}
 *   {{! a comment }}                      stripped
 *
 * Unknown paths render as the empty string rather than throwing. A CMS page
 * that references a variable the tenant has not filled in should render with a
 * gap, not a 500 — the same lenient posture `parseSiteBlocks` took before it.
 *
 * SECURITY — this runs BEFORE sanitization, never after. See
 * `sanitizeSiteDocument` in `lib/content/sanitize-html.ts` for why that ordering
 * is load-bearing. Every substituted value is HTML-escaped here, so data can
 * never introduce markup; the sanitizer that runs afterwards is what validates
 * the author's own markup and the URLs this step produced.
 */

export type VariableScalar = string | number | boolean | null | undefined;
export type VariableRecord = { [key: string]: VariableValue };
export type VariableValue = VariableScalar | VariableRecord | VariableRecord[];
export type VariableContext = Record<string, VariableValue>;

/** Matches `{{ … }}`, capturing the inside. Braces inside a tag are not allowed. */
const TAG = /\{\{\s*([^{}]*?)\s*\}\}/g;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * CSS values get an allowlist rather than an escape table. There is no CSS
 * equivalent of `&amp;` — the only safe move is to drop anything that could
 * terminate a declaration, open a `url()`, or start a new rule.
 */
export function escapeCssValue(input: string): string {
  return input.replace(/[^\w\s#.,()%/-]/g, "").slice(0, 200);
}

function isRecord(value: unknown): value is VariableRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Resolve a dotted path against a scope chain, innermost scope first. */
function lookup(path: string, scopes: VariableContext[]): VariableValue {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return undefined;

  for (let i = scopes.length - 1; i >= 0; i--) {
    let cursor: VariableValue = scopes[i];
    let ok = true;
    for (const part of parts) {
      if (!isRecord(cursor) || !(part in cursor)) {
        ok = false;
        break;
      }
      cursor = cursor[part];
    }
    if (ok) return cursor;
  }
  return undefined;
}

function stringify(value: VariableValue): string {
  if (value === null || value === undefined || value === false) return "";
  if (value === true) return "true";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "string") return value;
  // Objects and arrays have no sensible inline rendering. Emitting
  // "[object Object]" onto a public page helps nobody.
  return "";
}

function truthy(value: VariableValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return true;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return value !== 0;
  return Boolean(value);
}

type Node =
  | { kind: "text"; value: string }
  | { kind: "var"; path: string }
  | { kind: "each"; path: string; body: Node[] }
  | { kind: "if"; path: string; body: Node[]; alt: Node[] };

type Token =
  | { t: "text"; value: string }
  | { t: "var"; path: string }
  | { t: "each"; path: string }
  | { t: "if"; path: string }
  | { t: "else" }
  | { t: "endEach" }
  | { t: "endIf" };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  TAG.lastIndex = 0;

  for (let m = TAG.exec(source); m !== null; m = TAG.exec(source)) {
    if (m.index > last) tokens.push({ t: "text", value: source.slice(last, m.index) });
    last = m.index + m[0].length;

    const inner = m[1].trim();
    if (inner.startsWith("!")) continue; // comment
    if (inner === "else") tokens.push({ t: "else" });
    else if (inner === "/each") tokens.push({ t: "endEach" });
    else if (inner === "/if") tokens.push({ t: "endIf" });
    else if (inner.startsWith("#each ")) tokens.push({ t: "each", path: inner.slice(6).trim() });
    else if (inner.startsWith("#if ")) tokens.push({ t: "if", path: inner.slice(4).trim() });
    else if (inner.length > 0) tokens.push({ t: "var", path: inner });
  }

  if (last < source.length) tokens.push({ t: "text", value: source.slice(last) });
  return tokens;
}

/**
 * Build the tree. Unbalanced tags are tolerated: an unclosed `{{#each}}` simply
 * runs to the end of the document. Authors have half a block typed at all times
 * while the live preview re-renders on every keystroke, and throwing there would
 * make the preview flash an error on the way to valid markup.
 */
function parse(tokens: Token[]): Node[] {
  let i = 0;

  function walk(stop: ("endEach" | "endIf" | "else")[]): {
    nodes: Node[];
    stopped: string | null;
  } {
    const nodes: Node[] = [];
    while (i < tokens.length) {
      const token = tokens[i];
      if (
        (token.t === "endEach" || token.t === "endIf" || token.t === "else") &&
        stop.includes(token.t)
      ) {
        i++;
        return { nodes, stopped: token.t };
      }
      i++;
      switch (token.t) {
        case "text":
          nodes.push({ kind: "text", value: token.value });
          break;
        case "var":
          nodes.push({ kind: "var", path: token.path });
          break;
        case "each": {
          const body = walk(["endEach"]).nodes;
          nodes.push({ kind: "each", path: token.path, body });
          break;
        }
        case "if": {
          const first = walk(["endIf", "else"]);
          let alt: Node[] = [];
          if (first.stopped === "else") alt = walk(["endIf"]).nodes;
          nodes.push({ kind: "if", path: token.path, body: first.nodes, alt });
          break;
        }
        default:
          // A stray {{else}} / {{/each}} / {{/if}} with no opener. Drop it.
          break;
      }
    }
    return { nodes, stopped: null };
  }

  return walk([]).nodes;
}

function evaluate(
  nodes: Node[],
  scopes: VariableContext[],
  escape: (value: string) => string
): string {
  let out = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        out += node.value;
        break;
      case "var":
        out += escape(stringify(lookup(node.path, scopes)));
        break;
      case "each": {
        const list = lookup(node.path, scopes);
        if (!Array.isArray(list)) break;
        for (let index = 0; index < list.length; index++) {
          out += evaluate(
            node.body,
            [...scopes, { this: list[index], "@index": index, "@number": index + 1 }],
            escape
          );
        }
        break;
      }
      case "if":
        out += evaluate(
          truthy(lookup(node.path, scopes)) ? node.body : node.alt,
          scopes,
          escape
        );
        break;
    }
  }
  return out;
}

function render(
  source: string,
  ctx: VariableContext,
  escape: (value: string) => string
): string {
  return evaluate(parse(tokenize(source)), [ctx], escape);
}

/** Render author HTML. Every substituted value is HTML-escaped. */
export function renderTemplate(source: string, ctx: VariableContext): string {
  return render(source, ctx, escapeHtml);
}

/** Render author CSS. Values are reduced to a safe character allowlist. */
export function renderCssTemplate(source: string, ctx: VariableContext): string {
  return render(source, ctx, escapeCssValue);
}

/**
 * Every variable path a document references, deduped, including the ones named
 * by `#each` / `#if`. Used to decide whether a page needs the viewer's session
 * resolved (which forces it dynamic) and to skip catalog queries a page never
 * asks for. Scope-local names (`this.*`, `@index`) are excluded — they resolve
 * against a loop item, not the context.
 */
export function usedVariables(source: string): string[] {
  const found = new Set<string>();
  for (const token of tokenize(source)) {
    if (token.t === "var" || token.t === "each" || token.t === "if") {
      const path = token.path;
      if (!path || path === "this" || path.startsWith("this.") || path.startsWith("@")) {
        continue;
      }
      found.add(path);
    }
  }
  return [...found];
}

/** True when the document references any variable under one of `prefixes`. */
export function referencesAny(source: string, prefixes: readonly string[]): boolean {
  const used = usedVariables(source);
  return used.some((path) =>
    prefixes.some((prefix) => {
      const root = prefix.replace(/\.$/, "");
      return path === root || path.startsWith(`${root}.`);
    })
  );
}
