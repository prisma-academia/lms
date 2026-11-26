import sanitize from "sanitize-html";
import { z } from "zod";
import type { Agent } from "@mastra/core/agent";
// Relative imports throughout: the offline check script runs this module with
// no bundler, and nothing here should depend on how path aliases are resolved.
import { AiError, generateText } from "../ai/run";
import { sanitizeSiteDocument } from "../content/sanitize-site-document";
import { scopeSelectorFor } from "../content/sanitize-css";
// A CSS pretty-printer with nothing certificate-specific in it; it lives there
// because the certificate designer needed it first.
import { formatCss } from "../certificates/ai";
import { renderCssTemplate, renderTemplate, usedVariables, type VariableContext } from "./template";
import {
  SITE_PAGE_KINDS,
  findPageKind,
  findSiteForm,
  formAllowedOn,
  pageKindProblems,
  type SitePageKind,
} from "./site-api";
import { sampleContext, variablesForKind, type VariableDef } from "./variables";
import {
  MAX_BRIEF_CHARS,
  MAX_REVISE_SOURCE_CHARS,
  createSitePrompt,
  effectiveKind,
  repairSitePrompt,
  reviseSitePrompt,
  targetLabel,
  type SiteAiTarget,
  type SiteDesignContext,
} from "./ai-guide";

/**
 * The AI page designer, minus the model.
 *
 * A model's reply is text. Between that text and a page someone can put in the
 * editor sit three jobs, all here and all testable without a provider key:
 *
 *   1. EXTRACT  — find the document in the reply (models wrap things in
 *                 markdown fences, helpful sentences, or a whole <html> page).
 *   2. CLEAN    — remove from the SOURCE whatever the sanitizer would remove
 *                 when the page is shown, so the editor does not fill up with
 *                 markup that never appears.
 *   3. CHECK    — say what is wrong with it in words a person can act on, and
 *                 whether it can be published at all.
 *
 * None of this is the security boundary. A page's source is stored raw and
 * sanitized every time it is rendered (lib/site/render-page.tsx); that does not
 * change. Step 2 exists so that what staff see in the editor matches what a
 * visitor gets, and step 3 so that a sign-in page with no sign-in form is
 * caught here rather than by the academy's learners.
 */

/** Longest page source the editor will save (`htmlSourceSchema`). */
const MAX_PAGE_CHARS = 200_000;
/** Longest header or footer the layout route will save. */
const MAX_LAYOUT_CHARS = 60_000;

const KINDS = SITE_PAGE_KINDS.map((k) => k.kind) as [SitePageKind, ...SitePageKind[]];
const text = (max: number) => z.string().trim().max(max);

const common = {
  /** A page, or the header or footer shown around every page. */
  target: z.enum(["page", "header", "footer"]),
  /** The kind of page open in the editor. The header and footer always follow an ordinary page's rules. */
  kind: z.enum(KINDS).default("PAGE"),
  /** The page being edited, when it has been saved; used for the audit trail. */
  pageId: z.string().min(1).max(64).nullish(),
  pageTitle: text(200).nullish(),
};

export const siteDesignRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("create"),
    ...common,
    /** What the page should be, in the author's words. */
    brief: text(MAX_BRIEF_CHARS).min(3, "Say what you want this to be."),
  }),
  z.object({
    mode: z.literal("revise"),
    ...common,
    instruction: text(MAX_BRIEF_CHARS).min(3, "Say what to change."),
    currentHtml: z
      .string()
      .min(1, "There is nothing to change yet.")
      .max(
        MAX_REVISE_SOURCE_CHARS,
        "This document is too long to change with AI. Edit it by hand, or ask for a new design."
      ),
  }),
]);

export type SiteDesignRequest = z.infer<typeof siteDesignRequestSchema>;

/* -------------------------------------------------------------------------- */
/* 1. Extract                                                                  */
/* -------------------------------------------------------------------------- */

const FENCE = /```[a-zA-Z0-9_-]*[ \t]*\r?\n([\s\S]*?)```/g;
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const LINK_TAG = /<link\b[^>]*>/gi;

/**
 * The document inside a model's reply.
 *
 * Handles the three ways a reply is not just the document: wrapped in a
 * markdown fence, surrounded by sentences, or delivered as a whole HTML page.
 * Returns an empty string when there is no markup at all.
 *
 * A `<link>` is deliberately kept: the sanitizer removes it, and keeping it
 * this far is what lets the report say "it tried to load a stylesheet from
 * another website" instead of the design simply looking wrong.
 */
export function extractSiteHtml(reply: string): string {
  let body = reply.replace(/\r\n/g, "\n").trim();

  // A fenced block: take the one with the most markup in it, in case the reply
  // also fences a snippet while explaining itself.
  const fenced = [...body.matchAll(FENCE)].map((m) => m[1]).filter((block) => block.includes("<"));
  if (fenced.length > 0) {
    body = fenced.reduce((best, block) => (block.length > best.length ? block : best)).trim();
  } else {
    // An opening fence the reply never closed (it ran out of room, or forgot).
    body = body.replace(/^```[a-zA-Z0-9_-]*[ \t]*\n/, "").replace(/\n```\s*$/, "");
  }

  // A full document: keep its styles (and stylesheet links, to be reported)
  // and the contents of <body>.
  const bodyTag = /<body\b[^>]*>([\s\S]*?)(?:<\/body\s*>|$)/i.exec(body);
  if (bodyTag) {
    const before = body.slice(0, bodyTag.index);
    const head = [...before.matchAll(STYLE_BLOCK), ...before.matchAll(LINK_TAG)].map((m) => m[0]).join("\n");
    body = `${head}\n${bodyTag[1]}`;
  }
  body = body
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, "")
    .replace(/<(?:meta|base)\b[^>]*>/gi, "");

  // Sentences before the document and after it. The document starts at the
  // first line that begins with a tag — HTML or template: a header can open
  // with `{{#if user.isAuthenticated}}`, and cutting that off would unbalance
  // it — and ends at the last line that finishes with one.
  const lines = body.split("\n");
  const first = lines.findIndex((line) => /^\s*(?:<[a-zA-Z!]|\{\{)/.test(line));
  let last = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/(?:>|\}\})\s*$/.test(lines[i])) {
      last = i;
      break;
    }
  }
  if (first !== -1 && last >= first) {
    const sliced = lines.slice(first, last + 1).join("\n").trim();
    if (/<[a-zA-Z]/.test(sliced)) return sliced;
  }

  // One line with the markup in the middle of a sentence.
  const start = body.indexOf("<");
  const end = body.lastIndexOf(">");
  if (start === -1 || end <= start) return "";
  return body.slice(start, end + 1).trim();
}

/* -------------------------------------------------------------------------- */
/* 2. Clean                                                                    */
/* -------------------------------------------------------------------------- */

/** One `{{ … }}` template tag. Same shape the template engine tokenises. */
const TEMPLATE_TAG = /\{\{[^{}]*\}\}/g;
const PLACEHOLDER = /zqsit(\d+)qz/g;

/**
 * Swap every template tag for a token the sanitizers treat as ordinary text.
 *
 * The sanitizer has to run on the source, but the source is a template: it
 * would check `src="{{ tenant.logoUrl }}"` as a URL and reject a `{{ }}` in a
 * CSS value as a brace. Letters and digits pass through both untouched — as
 * text, as an attribute value, as a relative URL and as a CSS identifier — and
 * are swapped back afterwards.
 */
function protect(source: string, tags: string[]): string {
  return source.replace(TEMPLATE_TAG, (tag) => {
    tags.push(tag);
    return `zqsit${tags.length - 1}qz`;
  });
}

/** Put the tags back. Returns null if any was lost or duplicated on the way. */
function restore(source: string, tags: readonly string[]): string | null {
  const seen = new Set<number>();
  let duplicated = false;
  const restored = source.replace(PLACEHOLDER, (_match, index: string) => {
    const i = Number(index);
    if (seen.has(i)) duplicated = true;
    seen.add(i);
    return tags[i] ?? "";
  });
  return !duplicated && seen.size === tags.length ? restored : null;
}

const SOURCE_ID = "zqsitesrc";
const SOURCE_SCOPE = scopeSelectorFor(SOURCE_ID).selector;
const SOURCE_SCOPE_PATTERN = SOURCE_SCOPE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Take the sanitizer's scope back out of a stylesheet, leaving the author's
 * own selectors. A selector that WAS the scope (`body`, `:root`) becomes
 * `:root`, which the render-time pass maps to the page's container again — the
 * same place.
 */
function unscope(css: string): string {
  return css
    .replace(new RegExp(`${SOURCE_SCOPE_PATTERN}(?=\\s*[,{])`, "g"), ":root")
    .replace(new RegExp(`${SOURCE_SCOPE_PATTERN}\\s+`, "g"), "");
}

function splitStyles(source: string): { css: string; markup: string } {
  const css: string[] = [];
  const markup = source.replace(STYLE_BLOCK, (_match, body: string) => {
    css.push(body);
    return "";
  });
  return { css: css.join("\n"), markup };
}

/**
 * Two visitors, so both sides of every `{{#if}}` and both an empty and a full
 * list are exercised: a signed-in learner at an academy with everything filled
 * in, and a stranger at one with nothing.
 */
function comparisonContexts(): VariableContext[] {
  const sample = sampleContext() as VariableContext;
  const tenant = (sample.tenant ?? {}) as Record<string, unknown>;
  const full = {
    ...sample,
    tenant: { ...tenant, logoUrl: "https://example.test/logo.png", heroImageUrl: "https://example.test/hero.jpg" },
  } as VariableContext;
  const bare = {
    ...sample,
    tenant: { ...tenant, logoUrl: "", heroImageUrl: "", email: "", phone: "", address: "", website: "" },
    user: { isAuthenticated: false, name: "", email: "" },
    courses: [],
    programmes: [],
    nav: [],
    catalog: { coursesUrl: "/courses", programmesUrl: "/programmes", query: "", count: 0 },
  } as VariableContext;
  return [full, bare];
}

/** The signed-out visitor: who a sign-in page is for, and who most public traffic is. */
function visitorContext(): VariableContext {
  return { ...sampleContext(), user: { isAuthenticated: false, name: "", email: "" } } as VariableContext;
}

/**
 * Which part of the site a document is. The sanitizer treats the header
 * differently in one respect — only it may stick to the top of the window — so
 * every pass through the sanitizer here has to say which part it is holding.
 */
type SitePart = SiteAiTarget;

function renderForComparison(source: string, context: VariableContext, kind: SitePageKind, part: SitePart): string {
  const doc = sanitizeSiteDocument(renderTemplate(source, context), "cmp", { kind, part });
  return `${doc.css}\n---\n${doc.html}`.replace(/\s+/g, " ").trim();
}

/**
 * Remove from a document's source everything the sanitizer would remove when
 * it is rendered, leaving the `{{ }}` tags where they were.
 *
 * Trusts nothing it did itself: the cleaned source is used only if it renders,
 * through the real pipeline, to exactly what the original renders to. If the
 * two differ in any way — a tag in an odd place, a construct this function did
 * not anticipate — the original source is returned untouched. That is always
 * safe, because the original is sanitized at render time regardless.
 */
export function cleanSiteSource(
  source: string,
  kind: SitePageKind,
  part: SitePart = "page"
): { html: string; cleaned: boolean } {
  const original = source.trim();
  if (!original) return { html: "", cleaned: false };

  const tags: string[] = [];
  const doc = sanitizeSiteDocument(protect(original, tags), SOURCE_ID, { kind, part });

  const cleanMarkup = doc.html
    // The sanitizer gives the search box its address; that is the platform's
    // to set on every render, not something to write into the author's source.
    .replace(/<form\b[^>]*\bdata-lms-form="search"[^>]*>/gi, (tag) =>
      tag.replace(/\s+action="\/courses"/, "").replace(/\s+method="get"/, "")
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Indented one step, the way a stylesheet sits inside its <style> element.
  const cleanCss = doc.css.trim()
    ? formatCss(unscope(doc.css))
        .split("\n")
        .map((line) => (line ? `  ${line}` : line))
        .join("\n")
    : "";

  const assembled = cleanCss ? `<style>\n${cleanCss}\n</style>\n\n${cleanMarkup}` : cleanMarkup;
  const candidate = restore(assembled, tags);
  if (candidate === null) return { html: original, cleaned: false };

  const same = comparisonContexts().every(
    (context) =>
      renderForComparison(candidate, context, kind, part) === renderForComparison(original, context, kind, part)
  );
  return same ? { html: candidate, cleaned: true } : { html: original, cleaned: false };
}

/* -------------------------------------------------------------------------- */
/* 3. Check                                                                    */
/* -------------------------------------------------------------------------- */

export type SiteDesignIssue = {
  /** `error` means the document cannot be used as it is. */
  severity: "error" | "warning" | "info";
  code: string;
  /** Written for the staff member, not for a developer. */
  message: string;
};

export type SiteDesignReport = {
  issues: SiteDesignIssue[];
  /** `{{ }}` paths that do not exist on this kind of page; they render as blanks. */
  unknownVariables: string[];
  /** `{{ this.field }}` uses that are not a field of the list being looped over. */
  unknownFields: string[];
  /** Forms the platform will not run here, and fields it will not send. */
  formProblems: string[];
  /** Why a page of this kind cannot be published as it stands. */
  kindProblems: string[];
  /** What the sanitizer takes out of this document, in plain words. */
  removed: string[];
  /** Other websites it loads files from. */
  remoteHosts: string[];
  /** True when any issue is an error: the result should not be applied. */
  blocked: boolean;
};

type Counts = Map<string, number>;

function bump(counts: Counts, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Every element and attribute in a piece of markup, counted.
 *
 * Uses `sanitize-html` purely as an HTML parser — with everything allowed — so
 * that "what was there" and "what is left" are read by the same parser the
 * sanitizer itself uses. The output is thrown away.
 */
function markupInventory(html: string): Counts {
  const counts: Counts = new Map();
  sanitize(html, {
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true,
    transformTags: {
      "*": (tagName, attribs) => {
        bump(counts, `<${tagName}>`);
        for (const name of Object.keys(attribs)) bump(counts, `${tagName}[${name}]`);
        return { tagName, attribs };
      },
    },
  });
  return counts;
}

/**
 * At-rules, rules and declarations in a stylesheet, counted. A tolerant reader
 * for reporting only — nothing security-relevant is decided from it.
 */
function cssInventory(css: string): Counts {
  const counts: Counts = new Map();
  const source = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  let buffer = "";
  let depth = 0;
  let quote: string | null = null;
  let parens = 0;

  const statement = (raw: string) => {
    const segment = raw.trim();
    if (!segment) return;
    const at = /^@([a-zA-Z-]+)/.exec(segment);
    if (at) return bump(counts, `@${at[1].toLowerCase()}`);
    const declaration = /^(-{0,2}[a-zA-Z][\w-]*)\s*:/.exec(segment);
    if (depth > 0 && declaration) bump(counts, `decl:${declaration[1].toLowerCase()}`);
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      buffer += ch + (source[i + 1] ?? "");
      i++;
    } else if (quote) {
      buffer += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      buffer += ch;
    } else if (ch === "(") {
      parens++;
      buffer += ch;
    } else if (ch === ")") {
      parens = Math.max(0, parens - 1);
      buffer += ch;
    } else if (parens > 0) {
      buffer += ch;
    } else if (ch === "{") {
      const at = /^@([a-zA-Z-]+)/.exec(buffer.trim());
      bump(counts, at ? `@${at[1].toLowerCase()}` : "rule");
      buffer = "";
      depth++;
    } else if (ch === "}") {
      statement(buffer);
      buffer = "";
      depth = Math.max(0, depth - 1);
    } else if (ch === ";") {
      statement(buffer);
      buffer = "";
    } else {
      buffer += ch;
    }
  }
  statement(buffer);
  return counts;
}

function lost(before: Counts, after: Counts): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, count] of before) {
    const remaining = after.get(key) ?? 0;
    if (count > remaining) out.set(key, count - remaining);
  }
  return out;
}

const times = (n: number) => (n > 1 ? ` (${n})` : "");

/**
 * What the render-time sanitizer removes from this document.
 *
 * Measured, not predicted: the document is rendered with sample data, put
 * through the real sanitizer for its kind of page, and the two are compared.
 */
export function siteSanitizerRemovals(source: string, kind: SitePageKind, part: SitePart = "page"): string[] {
  const interpolated = renderTemplate(source, comparisonContexts()[0]);
  const { css, markup } = splitStyles(interpolated);
  const sanitized = sanitizeSiteDocument(interpolated, "check", { kind, part });

  const removed: string[] = [];

  const markupLost = lost(markupInventory(markup), markupInventory(sanitized.html));
  const removedTags = new Set<string>();
  for (const [key, count] of markupLost) {
    const tag = /^<(.+)>$/.exec(key);
    if (!tag) continue;
    removedTags.add(tag[1]);
    removed.push(`<${tag[1]}> element${count > 1 ? "s" : ""}${times(count)}`);
  }
  for (const [key, count] of markupLost) {
    const attribute = /^(.+)\[(.+)\]$/.exec(key);
    // An attribute that went because its whole element went is not news.
    if (!attribute || removedTags.has(attribute[1])) continue;
    removed.push(`the ${attribute[2]} attribute on <${attribute[1]}>${times(count)}`);
  }

  const cssLost = lost(cssInventory(css), cssInventory(sanitized.css));
  const declarations: string[] = [];
  for (const [key, count] of cssLost) {
    if (key.startsWith("@")) removed.push(`the CSS ${key} rule${times(count)}`);
    else if (key === "rule") removed.push(`${count} CSS rule${count > 1 ? "s" : ""} the sanitizer could not keep`);
    else declarations.push(`${key.slice(5)}${times(count)}`);
  }
  if (declarations.length > 0) removed.push(`CSS declarations: ${declarations.join(", ")}`);

  return removed;
}

const TAG_INNER = /\{\{\s*([^{}]*?)\s*\}\}/g;

/**
 * `{{ this.field }}` uses that name a field the list does not have.
 *
 * The template engine prints nothing for an unknown field, so a card that reads
 * `{{ this.instructor }}` simply has a gap where the model imagined a name —
 * the kind of mistake nobody notices until the page is live.
 */
export function unknownLoopFields(source: string, variables: readonly VariableDef[]): string[] {
  const lists = new Map(variables.filter((v) => v.kind === "list").map((v) => [v.path, v] as const));
  // null = a loop over something this check does not know the shape of.
  const stack: (VariableDef | null)[] = [];
  const problems = new Set<string>();

  for (const match of source.matchAll(TAG_INNER)) {
    const inner = match[1].trim();
    if (!inner || inner.startsWith("!") || inner === "else" || inner === "/if") continue;
    if (inner.startsWith("#each ")) {
      stack.push(lists.get(inner.slice(6).trim()) ?? null);
      continue;
    }
    if (inner === "/each") {
      stack.pop();
      continue;
    }
    const path = inner.startsWith("#if ") ? inner.slice(4).trim() : inner;
    if (path !== "this" && !path.startsWith("this.")) continue;

    if (stack.length === 0) {
      problems.add(`{{ ${path} }} is used outside a {{#each}} loop`);
      continue;
    }
    const list = stack[stack.length - 1];
    if (!list) continue;
    const field = path === "this" ? "" : path.slice(5);
    if (!field || !(list.fields ?? []).some((f) => f.name === field)) {
      problems.add(`{{ ${path} }} inside {{#each ${list.path}}}`);
    }
  }
  return [...problems];
}

type FormScan = {
  /** Problems that leave a form on the page that does nothing. */
  dead: string[];
  /** Fields the platform will ignore. */
  fields: string[];
  /** Platform forms with nowhere for an error to be shown. */
  noErrorSlot: string[];
};

const FORM_BLOCK = /<form\b([^>]*)>([\s\S]*?)(?:<\/form\s*>|$)/gi;
const ATTR = (name: string) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");

function attribute(attrs: string, name: string): string | null {
  const match = ATTR(name).exec(attrs);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

/** The forms an author (or a model) wrote, judged against what this page may contain. */
function scanForms(markup: string, kind: SitePageKind, what: string): FormScan {
  const scan: FormScan = { dead: [], fields: [], noErrorSlot: [] };

  for (const match of markup.matchAll(FORM_BLOCK)) {
    const declared = attribute(match[1], "data-lms-form");
    const body = match[2];
    if (declared === null) {
      scan.dead.push(
        `It contains a form with no data-lms-form. The platform runs only its own forms, so this one would do nothing when submitted. Remove it${
          kind === "PAGE" ? " (for a contact form, link to mailto:{{ tenant.email }} instead)" : ""
        }.`
      );
      continue;
    }
    const form = findSiteForm(declared);
    if (!form) {
      scan.dead.push(`data-lms-form="${declared}" is not a form the platform has. Remove that form.`);
      continue;
    }
    if (!formAllowedOn(form, kind)) {
      const home = form.allowedOn === "any" ? "" : findPageKind(form.allowedOn[0]).label.toLowerCase();
      scan.dead.push(
        `The ${form.label.toLowerCase()} only works on the ${home}; on a ${what} it is removed. Take it out and link to that page instead.`
      );
      continue;
    }

    const names = [...body.matchAll(/<input\b([^>]*)>/gi)]
      .map((m) => attribute(m[1], "name"))
      .filter((name): name is string => Boolean(name) && !/zqsit|\{\{/.test(name ?? ""));
    for (const name of new Set(names)) {
      if (!form.fields.some((f) => f.name === name)) {
        scan.fields.push(
          `The ${form.label.toLowerCase()} has a field named "${name}", which the platform does not accept (it takes: ${form.fields
            .map((f) => f.name)
            .join(", ")}).`
        );
      }
    }
    // The search box has nothing to report; the forms that talk to the server do.
    if (form.kind !== "search" && !/\bdata-lms-error\b/i.test(body)) {
      scan.noErrorSlot.push(`The ${form.label.toLowerCase()} has no <p data-lms-error></p> for error messages.`);
    }
  }
  return scan;
}

/** Addresses the platform itself serves, which a page may link to as written. */
const KNOWN_PATHS = new Set([
  "/",
  "/courses",
  "/programmes",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/dashboard",
]);

function hostOf(url: string): string {
  return url.replace(/^(?:https?:)?\/\//i, "").split(/[/?#]/)[0].toLowerCase();
}

const PERSONAL_TAG = /\{\{\s*user\.(?:name|email)\s*\}\}/g;

/** True when the learner's name or email is written somewhere the renderer blanks it. */
function personalDataInMarkup(source: string): boolean {
  const { css, markup } = splitStyles(source);
  if (PERSONAL_TAG.test(css)) return true;
  PERSONAL_TAG.lastIndex = 0;
  for (const match of markup.matchAll(PERSONAL_TAG)) {
    const before = markup.slice(0, match.index);
    if (before.lastIndexOf("<") > before.lastIndexOf(">")) return true;
  }
  return false;
}

export function checkSiteSource(
  source: string,
  options: {
    target: SiteAiTarget;
    kind: SitePageKind | string | null | undefined;
    /**
     * The source before it was cleaned, when `source` is the cleaned one. What
     * the sanitizer removes, and which forms were dead, are measured against
     * this — measured against the cleaned source they would always be "none".
     */
    original?: string;
  }
): SiteDesignReport {
  const kind = effectiveKind(options.target, options.kind);
  const what = targetLabel(options.target, kind);
  const variables = variablesForKind(kind);
  const known = new Set(variables.map((v) => v.path));
  const issues: SiteDesignIssue[] = [];
  const add = (severity: SiteDesignIssue["severity"], code: string, message: string) =>
    issues.push({ severity, code, message });

  const empty: SiteDesignReport = {
    issues,
    unknownVariables: [],
    unknownFields: [],
    formProblems: [],
    kindProblems: [],
    removed: [],
    remoteHosts: [],
    blocked: true,
  };

  const { markup } = splitStyles(source);
  if (!markup.replace(/<!--[\s\S]*?-->/g, "").trim() || !/<[a-zA-Z]/.test(markup)) {
    add("error", "empty", `The reply did not contain a ${what}.`);
    return empty;
  }

  const limit = options.target === "page" ? MAX_PAGE_CHARS : MAX_LAYOUT_CHARS;
  if (source.length > limit) {
    add("error", "too_long", `This is too large to save as a ${what}. Ask for something simpler.`);
  }

  /* Variables ---------------------------------------------------------------- */

  const used = usedVariables(source);
  const unknownVariables = used.filter((path) => !known.has(path));
  for (const path of unknownVariables) {
    add(
      "warning",
      "unknown_variable",
      `{{ ${path} }} does not exist on a ${what}, so nothing appears there. Remove it or use one from the variable list.`
    );
  }
  const unknownFields = unknownLoopFields(source, variables);
  for (const problem of unknownFields) {
    add("warning", "unknown_field", `${problem} is not something that list has, so nothing appears there.`);
  }
  if (personalDataInMarkup(source)) {
    add(
      "warning",
      "personal_data",
      "It puts the learner's name or email inside a tag or a stylesheet. Those are shown only as text, so that spot will be blank."
    );
  }

  /* Forms ---------------------------------------------------------------------- */

  const original = options.original ?? source;
  const forms = scanForms(splitStyles(original).markup, kind, what);
  for (const problem of forms.dead) add("error", "dead_form", problem);
  for (const problem of forms.fields) add("warning", "unknown_field_name", problem);
  for (const problem of forms.noErrorSlot) {
    add("warning", "no_error_slot", `${problem} Problems will still be shown, but in an unstyled line at the end of the form.`);
  }

  // Judged as the signed-out visitor gets it: that is who a sign-in page is for.
  const asVisitor = sanitizeSiteDocument(renderTemplate(source, visitorContext()), "check", {
    kind,
    part: options.target,
  });
  const kindProblems = options.target === "page" ? pageKindProblems(kind, asVisitor.html) : [];
  for (const problem of kindProblems) {
    add("error", "not_publishable", `${problem} Without it this page cannot be published.`);
  }

  /* What does not survive ------------------------------------------------------ */

  const removed = siteSanitizerRemovals(original, kind, options.target);
  if (removed.length > 0) {
    add("warning", "sanitized", `Not allowed on a site page, so it was taken out: ${removed.join("; ")}.`);
  }

  /* Things that work but should be looked at ------------------------------------ */

  const plain = source.replace(TEMPLATE_TAG, "");
  const remoteHosts = [
    ...new Set(
      [
        ...plain.matchAll(/\b(?:src|srcset|poster)\s*=\s*["']?\s*((?:https?:)?\/\/[^\s"'>]+)/gi),
        ...plain.matchAll(/url\(\s*["']?\s*((?:https?:)?\/\/[^\s"')]+)/gi),
      ].map((m) => hostOf(m[1]))
    ),
  ];
  if (remoteHosts.length > 0) {
    const auth = kind === "LOGIN" || kind === "REGISTER" || kind === "FORGOT_PASSWORD";
    add(
      "warning",
      "remote_asset",
      `It loads files from another website (${remoteHosts.join(", ")}). ${
        auth
          ? "Sign-in pages do not load files from other websites at all, so they will be missing."
          : "That website sees every visitor to your page, and the design breaks if the file moves."
      }`
    );
  }

  const links = [...plain.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => (m[1] ?? m[2] ?? "").trim());
  const invented = [
    ...new Set(
      links
        .filter((href) => href.startsWith("/") && !href.startsWith("//"))
        .map((href) => href.split(/[?#]/)[0].replace(/\/+$/, "") || "/")
        .filter((path) => !KNOWN_PATHS.has(path))
    ),
  ];
  if (invented.length > 0) {
    add(
      "warning",
      "invented_link",
      `It links to ${invented.join(", ")}. ${invented.length === 1 ? "That page" : "Those pages"} may not exist on your site — check, or remove the link.`
    );
  }
  const external = [
    ...new Set(links.filter((href) => /^(?:https?:)?\/\//i.test(href)).map(hostOf).filter((host) => host && !host.includes("{"))),
  ];
  if (external.length > 0) {
    add("info", "external_link", `It links to other websites (${external.join(", ")}). Check each address is the one you mean.`);
  }

  // Both are taken out by the sanitizer (it is in the list above); these say
  // why, because "a declaration was removed" does not explain a layout that
  // no longer does what was asked. Read from the source as the model wrote it.
  const authoredCss = `${splitStyles(original).css}\n${[...original.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join("\n")}`;
  if (/position\s*:\s*fixed/i.test(authoredCss)) {
    add(
      "warning",
      "fixed_position",
      "It tried to pin something to the screen (position: fixed). Site pages may not do that — it could cover your header or the sign-in buttons — so that part has been taken out."
    );
  }
  if (options.target !== "header" && /position\s*:\s*(?:-webkit-)?sticky/i.test(authoredCss)) {
    add(
      "warning",
      "sticky_position",
      "It tried to keep something stuck to the top of the window (position: sticky). Only the site header may do that, so that part has been taken out and it will scroll with the page."
    );
  }

  const headings = (markup.match(/<h1\b/gi) ?? []).length;
  if (options.target === "page") {
    if (headings === 0) add("info", "no_h1", "It has no main heading (<h1>). Search engines and screen readers use one to know what the page is.");
    else if (headings > 1) add("info", "many_h1", `It has ${headings} main headings (<h1>). A page reads best with one.`);
  } else if (headings > 0) {
    add("info", "h1_in_layout", `A ${what} appears on every page, so it should not contain a main heading (<h1>).`);
  }
  const wrapper = options.target === "page" ? "main" : options.target;
  if (new RegExp(`<${wrapper}\\b`, "i").test(markup)) {
    add("info", "nested_landmark", `It wraps itself in <${wrapper}>, but your site already provides that element around it.`);
  }

  /* What this kind of thing is expected to do ------------------------------------- */

  const uses = (path: string) => used.includes(path);
  if (options.target === "header" && !(uses("auth.loginUrl") && uses("auth.registerUrl"))) {
    add("warning", "no_account_links", "The header has no Sign in and Register links, so a visitor has no way in from the top of the page.");
  }
  if (options.target === "page") {
    if (kind === "COURSES" && !uses("courses")) {
      add("warning", "no_course_list", "It does not list your courses ({{#each courses}}), so the catalogue would be empty.");
    }
    if (kind === "COURSE_DETAIL" && !uses("course.title")) {
      add("warning", "no_course", "It never shows {{ course.title }}, so every course would get the same page with no name on it.");
    }
    if (kind === "PROGRAMME_DETAIL" && !uses("programme.title")) {
      add("warning", "no_programme", "It never shows {{ programme.title }}, so every programme would get the same page with no name on it.");
    }
  }

  return {
    issues,
    unknownVariables,
    unknownFields,
    formProblems: [...forms.dead, ...forms.fields],
    kindProblems,
    removed,
    remoteHosts,
    blocked: issues.some((issue) => issue.severity === "error"),
  };
}

/* -------------------------------------------------------------------------- */
/* Showing it                                                                  */
/* -------------------------------------------------------------------------- */

export type SitePreview = {
  /** Sanitized markup, variables filled in. */
  html: string;
  /** Sanitized, scoped CSS. May be empty. */
  css: string;
  /** Value for `data-css-scope` on the element that wraps `html`. */
  scope: string;
};

/**
 * A document as a visitor would get it: variables filled in, then sanitized
 * for its kind of page — the same two steps, in the same order, as the public
 * renderer.
 */
export function renderSitePreview(
  source: string,
  kind: SitePageKind,
  context: VariableContext,
  id = "site-ai",
  part: SitePart = "page"
): SitePreview {
  const doc = sanitizeSiteDocument(renderTemplate(source, context), id, { kind, part });
  return { html: doc.html, css: doc.css ? renderCssTemplate(doc.css, context) : "", scope: doc.scope };
}

/* -------------------------------------------------------------------------- */
/* Spend                                                                       */
/* -------------------------------------------------------------------------- */

/** How many designs one academy may ask for. A page is a longer reply than a certificate. */
export const SITE_AI_MAX_PER_HOUR = 30;
export const SITE_AI_MAX_PER_DAY = 120;

/**
 * Whether one more design may be asked for, given how many already were.
 * Returns the sentence to show when it may not, or null when it may.
 */
export function siteAiBudgetVerdict(counts: { lastHour: number; lastDay: number }): string | null {
  if (counts.lastHour >= SITE_AI_MAX_PER_HOUR) {
    return "Your academy has asked for a lot of AI designs in the last hour. Try again in a little while.";
  }
  if (counts.lastDay >= SITE_AI_MAX_PER_DAY) {
    return "Your academy has reached today's limit for AI page designs. It resets over the next 24 hours.";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The whole job                                                               */
/* -------------------------------------------------------------------------- */

/** Room for a full page with its stylesheet, and no more. */
const MAX_OUTPUT_TOKENS = 14_000;
const FIRST_CALL_MS = 170_000;
/** Total time one request may spend, so a correction never runs past the route's limit. */
const TOTAL_BUDGET_MS = 280_000;
const MIN_REPAIR_MS = 60_000;

export type SiteDesignResult = {
  /** The document to put in the editor. */
  html: string;
  /** The page kind whose rules were applied (always PAGE for a header or footer). */
  kind: SitePageKind;
  report: SiteDesignReport;
  /** How many model calls were made: 1, or 2 when a correction was needed. */
  attempts: number;
};

type Checked = { html: string; report: SiteDesignReport };

/** Reply text in; a cleaned document and what is wrong with it out. */
export function processSiteReply(
  reply: string,
  options: { target: SiteAiTarget; kind: SitePageKind | string | null | undefined }
): Checked {
  const kind = effectiveKind(options.target, options.kind);
  const original = extractSiteHtml(reply);
  const { html } = cleanSiteSource(original, kind, options.target);
  return { html, report: checkSiteSource(html, { target: options.target, kind, original }) };
}

/**
 * Problems worth one more model call: the ones the model caused and can fix.
 * Empty unless something makes the result unusable — a missing required form,
 * a form that would do nothing, a variable or field that does not exist.
 */
function repairList(report: SiteDesignReport, original: string, target: SiteAiTarget, kind: SitePageKind): string[] {
  const problems: string[] = [...report.kindProblems, ...report.formProblems];
  for (const path of report.unknownVariables) {
    problems.push(`{{ ${path} }} is not an available variable here. Remove it, or replace it with one from the list.`);
  }
  for (const field of report.unknownFields) {
    problems.push(`${field} is not a field of that list. Use only the fields listed for it.`);
  }
  if (problems.length === 0) return [];

  // Since a correction is being made anyway, tidy these too.
  const scan = scanForms(splitStyles(original).markup, kind, targetLabel(target, kind));
  problems.push(...scan.noErrorSlot.map((p) => `${p} Add one inside the form.`));
  return [...new Set(problems)];
}

function severityScore(report: SiteDesignReport): number {
  return (
    report.issues.filter((issue) => issue.severity === "error").length * 100 +
    (report.unknownVariables.length + report.unknownFields.length) * 10 +
    report.issues.filter((issue) => issue.severity === "warning").length
  );
}

/**
 * Ask the model for a page, header or footer and return it cleaned and checked.
 *
 * Makes one call, and at most one more: if the reply could not be published or
 * leans on something that does not exist, the model is shown exactly what is
 * wrong and asked to fix only that. A failed correction never costs the first
 * answer — and a result that still cannot be published says so, as an error in
 * its report, rather than being passed off as usable.
 */
export async function designSite(
  agent: Agent,
  request: SiteDesignRequest,
  context: SiteDesignContext
): Promise<SiteDesignResult> {
  const started = Date.now();
  const target = request.target;
  const kind = effectiveKind(target, request.kind);

  const prompt =
    request.mode === "create"
      ? createSitePrompt({ target, kind, brief: request.brief }, context)
      : reviseSitePrompt({ target, kind, instruction: request.instruction, currentHtml: request.currentHtml }, context);

  const reply = await generateText(agent, prompt, {
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    timeoutMs: FIRST_CALL_MS,
    maxRetries: 1,
  });

  let best = processSiteReply(reply, { target, kind });
  // No markup at all is not a page with problems; it is a failed call.
  if (!best.html) throw new AiError("invalid_output", "The reply contained no page markup.");

  let attempts = 1;
  const problems = repairList(best.report, extractSiteHtml(reply), target, kind);
  const remaining = TOTAL_BUDGET_MS - (Date.now() - started);

  if (problems.length > 0 && remaining >= MIN_REPAIR_MS) {
    attempts = 2;
    try {
      const corrected = await generateText(agent, repairSitePrompt({ target, kind, html: best.html, problems }), {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeoutMs: remaining - 5_000,
        maxRetries: 0,
      });
      const second = processSiteReply(corrected, { target, kind });
      if (second.html && severityScore(second.report) < severityScore(best.report)) best = second;
    } catch {
      // The first answer stands, with its problems listed for the person to judge.
    }
  }

  return { html: best.html, kind, report: best.report, attempts };
}
