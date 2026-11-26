import sanitize from "sanitize-html";
import { z } from "zod";
import type { Agent } from "@mastra/core/agent";
// Relative imports throughout: the offline check script runs this module with
// no bundler, and nothing here should depend on how path aliases are resolved.
import { AiError, generateText } from "../ai/run";
import { renderTemplate, usedVariables, type VariableContext } from "../site/template";
import { sanitizeHtml, sanitizeHtmlWithStyles } from "../content/sanitize-html";
import { sanitizeAndScopeCss } from "../content/sanitize-css";
import {
  CERTIFICATE_VARIABLES,
  LEARNER_NAME_VARIABLE,
  certificateSampleContext,
  type CertificateVariableDef,
} from "./variables";
import {
  createCertificatePrompt,
  repairCertificatePrompt,
  reviseCertificatePrompt,
  type CertificateDesignContext,
} from "./ai-guide";

/**
 * The AI certificate designer, minus the model.
 *
 * A model's reply is text. Between that text and a certificate someone can
 * apply sit three jobs, all here and all testable without a provider key:
 *
 *   1. EXTRACT  — find the certificate in the reply (models wrap things in
 *                 markdown fences and helpful sentences).
 *   2. CLEAN    — remove from the SOURCE whatever the sanitizer would remove at
 *                 render time, so the editor does not fill up with markup that
 *                 never shows.
 *   3. CHECK    — say what is wrong with it in words a person can act on.
 *
 * Showing it is `renderCertificatePreview` in render-html.ts: the same pipeline
 * a learner's certificate goes through.
 *
 * None of this is the security boundary. A certificate's source is stored raw
 * and sanitized every time it is rendered (`render-html.ts`); that does not
 * change. Step 2 exists so that what staff see in the editor matches what
 * prints.
 */

/** Longest certificate source the design schema will store. */
const MAX_SOURCE_CHARS = 200_000;

/**
 * Longest certificate that can be sent back to the model for a revision. It has
 * to return the whole thing, so this is really a limit on the reply.
 */
export const MAX_REVISE_SOURCE_CHARS = 40_000;

const text = (max: number) => z.string().trim().max(max);

export const certificateDesignRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("create"),
    /** What the certificate is for. */
    occasion: text(1500).min(3, "Say what the certificate is for."),
    style: text(600).nullish(),
    colours: text(400).nullish(),
    orientation: z.enum(["landscape", "portrait"]).default("landscape"),
  }),
  z.object({
    mode: z.literal("revise"),
    instruction: text(1500).min(3, "Say what to change."),
    currentHtml: z
      .string()
      .min(1, "There is no certificate to revise yet.")
      .max(
        MAX_REVISE_SOURCE_CHARS,
        "This certificate's HTML is too long to revise with AI. Edit it by hand, or start a new design."
      ),
  }),
]);

export type CertificateDesignRequest = z.infer<typeof certificateDesignRequestSchema>;

/* -------------------------------------------------------------------------- */
/* 1. Extract                                                                  */
/* -------------------------------------------------------------------------- */

const FENCE = /```[a-zA-Z0-9_-]*[ \t]*\r?\n([\s\S]*?)```/g;
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;

/**
 * The certificate inside a model's reply.
 *
 * Handles the three ways a reply is not just the certificate: wrapped in a
 * markdown fence, surrounded by sentences, or delivered as a whole HTML
 * document. Returns an empty string when there is no markup at all.
 */
export function extractCertificateHtml(reply: string): string {
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

  // A full document: keep its styles and the contents of <body>.
  const bodyTag = /<body\b[^>]*>([\s\S]*?)(?:<\/body\s*>|$)/i.exec(body);
  if (bodyTag) {
    const before = body.slice(0, bodyTag.index);
    const headStyles = [...before.matchAll(STYLE_BLOCK)].map((m) => m[0]).join("\n");
    body = `${headStyles}\n${bodyTag[1]}`;
  }
  body = body
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "")
    .replace(/<(?:meta|title|link|base)\b[^>]*>(?:[^<]*<\/title\s*>)?/gi, "");

  // Sentences before the first tag and after the last one. A line that STARTS
  // with a tag is preferred as the beginning: an introduction can mention
  // "<style>" in passing, and starting there would swallow the sentence.
  const lineStart = /^[ \t]*<(?:style|div|section|article|main|table|header|figure|!--)/im.exec(body);
  const first = lineStart ? lineStart.index : body.indexOf("<");
  const last = body.lastIndexOf(">");
  if (first === -1 || last <= first) return "";
  return body.slice(first, last + 1).trim();
}

/* -------------------------------------------------------------------------- */
/* 2. Clean                                                                    */
/* -------------------------------------------------------------------------- */

/** One `{{ … }}` template tag. Same shape the template engine tokenises. */
const TEMPLATE_TAG = /\{\{[^{}]*\}\}/g;
const PLACEHOLDER = /zqcrt(\d+)qz/g;

/**
 * Swap every template tag for a token the sanitizers treat as ordinary text.
 *
 * The sanitizer has to run on the source, but the source is a template: it
 * would check `src="{{ tenant.logoUrl }}"` as a URL and reject `{{ accentColor }}`
 * as a brace in a CSS value. Letters and digits pass through both untouched —
 * as text, as an attribute value, as a relative URL and as a CSS identifier —
 * and are swapped back afterwards.
 */
function protect(source: string, tags: string[]): string {
  return source.replace(TEMPLATE_TAG, (tag) => {
    tags.push(tag);
    return `zqcrt${tags.length - 1}qz`;
  });
}

/** Put the tags back. Returns null if any was lost or duplicated on the way. */
function restore(source: string, tags: readonly string[]): string | null {
  const seen = new Set<number>();
  const restored = source.replace(PLACEHOLDER, (_match, index: string) => {
    seen.add(Number(index));
    return tags[Number(index)] ?? "";
  });
  return seen.size === tags.length ? restored : null;
}

const SOURCE_SCOPE = '[data-css-scope="zqcertsrc"]';
const SOURCE_SCOPE_PATTERN = SOURCE_SCOPE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Sanitize a stylesheet but keep it as the author's own, unscoped CSS.
 *
 * The CSS sanitizer only exists in a form that also scopes every selector, so
 * it is scoped to a sentinel here and the sentinel is taken back out. A
 * selector that WAS the scope (`body`, `:root`) becomes `:root`, which the
 * render-time pass maps to the certificate's wrapper again — the same place.
 */
function sanitizeCssSource(css: string): string {
  return sanitizeAndScopeCss(css, SOURCE_SCOPE)
    .replace(new RegExp(`${SOURCE_SCOPE_PATTERN}(?=\\s*[,{])`, "g"), ":root")
    .replace(new RegExp(`${SOURCE_SCOPE_PATTERN}\\s+`, "g"), "");
}

/**
 * Lay sanitized CSS out one declaration per line.
 *
 * The sanitizer emits a rule per line, which is safe but miserable to edit by
 * hand — and editing by hand is the next thing that happens to it.
 */
export function formatCss(css: string, indent = "  "): string {
  const lines: string[] = [];
  let depth = 0;
  let buffer = "";
  let quote: string | null = null;
  let parens = 0;

  const emit = (line: string) => {
    const trimmed = line.trim();
    if (trimmed) lines.push(`${indent.repeat(depth)}${trimmed}`);
  };

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "\\") {
      buffer += ch + (css[i + 1] ?? "");
      i++;
      continue;
    }
    if (quote) {
      buffer += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
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
      emit(`${buffer.trim()} {`);
      buffer = "";
      depth++;
    } else if (ch === "}") {
      if (buffer.trim()) emit(`${buffer.trim()};`);
      buffer = "";
      depth = Math.max(0, depth - 1);
      emit("}");
      if (depth === 0) lines.push("");
    } else if (ch === ";") {
      emit(`${buffer.trim()};`);
      buffer = "";
    } else if (ch === "\n") {
      buffer += " ";
    } else {
      buffer += ch;
    }
  }
  if (buffer.trim()) emit(buffer);

  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function splitStyles(source: string): { css: string; markup: string } {
  const css: string[] = [];
  const markup = source.replace(STYLE_BLOCK, (_match, body: string) => {
    css.push(body);
    return "";
  });
  return { css: css.join("\n"), markup };
}

/** Two sets of award data, so both sides of every `{{#if}}` are exercised. */
function sampleContexts(): VariableContext[] {
  const course = certificateSampleContext({
    tenantName: "Example Academy",
    logoUrl: "https://example.test/logo.png",
    primaryColor: "#1d4ed8",
    accentColor: "#0f766e",
  });
  const programme = {
    ...certificateSampleContext({ tenantName: "Example Academy", logoUrl: "", accentColor: "#b45309" }),
    courseTitle: "",
    programmeTitle: "Data Foundations",
  };
  return [course, programme] as VariableContext[];
}

function renderForComparison(source: string, context: VariableContext): string {
  const rendered = sanitizeHtmlWithStyles(renderTemplate(source, context), "cmp");
  return `${rendered.css}\n---\n${rendered.html}`.replace(/\s+/g, " ").trim();
}

/**
 * Remove from a certificate's source everything the sanitizer would remove
 * when it is rendered, leaving the `{{ }}` tags where they were.
 *
 * Trusts nothing it did itself: the cleaned source is used only if it renders,
 * through the real pipeline, to exactly what the original renders to. If the
 * two differ in any way — a tag in an odd place, a construct this function did
 * not anticipate — the original source is returned untouched. That is always
 * safe, because the original is sanitized at render time regardless.
 */
export function cleanCertificateSource(source: string): { html: string; cleaned: boolean } {
  const original = source.trim();
  if (!original) return { html: "", cleaned: false };

  const tags: string[] = [];
  const { css, markup } = splitStyles(protect(original, tags));

  const cleanMarkup = sanitizeHtml(markup)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Indented one step, the way a stylesheet sits inside its <style> element.
  const cleanCss = css.trim()
    ? formatCss(sanitizeCssSource(css))
        .split("\n")
        .map((line) => (line ? `  ${line}` : line))
        .join("\n")
    : "";

  const assembled = cleanCss ? `<style>\n${cleanCss}\n</style>\n\n${cleanMarkup}` : cleanMarkup;
  const candidate = restore(assembled, tags);
  if (candidate === null) return { html: original, cleaned: false };

  const same = sampleContexts().every(
    (context) => renderForComparison(candidate, context) === renderForComparison(original, context)
  );
  return same ? { html: candidate, cleaned: true } : { html: original, cleaned: false };
}

/* -------------------------------------------------------------------------- */
/* 3. Check                                                                    */
/* -------------------------------------------------------------------------- */

export type CertificateIssue = {
  /** `error` means the certificate cannot be used as it is. */
  severity: "error" | "warning" | "info";
  code: string;
  /** Written for the staff member, not for a developer. */
  message: string;
};

export type CertificateReport = {
  issues: CertificateIssue[];
  /** `{{ }}` paths that are not certificate variables; they print as blanks. */
  unknownVariables: string[];
  /** True when the learner's name is not shown anywhere. */
  missingLearnerName: boolean;
  /** What the sanitizer takes out of this certificate, in plain words. */
  removed: string[];
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
 * What the render-time sanitizer removes from this certificate.
 *
 * Measured, not predicted: the certificate is rendered with sample data, put
 * through the real sanitizer, and the two are compared.
 */
export function sanitizerRemovals(source: string): string[] {
  const [context] = sampleContexts();
  const interpolated = renderTemplate(source, context);
  const { css, markup } = splitStyles(interpolated);
  const sanitized = sanitizeHtmlWithStyles(interpolated, "check");

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

function visibleText(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ");
}

export function checkCertificateSource(
  source: string,
  options: {
    variables?: readonly CertificateVariableDef[];
    /** Also check that it is sized to scale with the sheet. Off for old designs being revised. */
    checkScaling?: boolean;
    /**
     * The source before it was cleaned, when `source` is the cleaned one. What
     * the sanitizer removes is measured against this — measured against the
     * cleaned source it would always be "nothing".
     */
    original?: string;
  } = {}
): CertificateReport {
  const variables = options.variables ?? CERTIFICATE_VARIABLES;
  const known = new Set(variables.map((v) => v.path));
  const issues: CertificateIssue[] = [];
  const add = (severity: CertificateIssue["severity"], code: string, message: string) =>
    issues.push({ severity, code, message });

  const { css, markup } = splitStyles(source);

  if (!markup.replace(/<!--[\s\S]*?-->/g, "").trim() || !/<[a-zA-Z]/.test(markup)) {
    add("error", "empty", "The reply did not contain a certificate.");
    return { issues, unknownVariables: [], missingLearnerName: true, removed: [], blocked: true };
  }
  if (source.length > MAX_SOURCE_CHARS) {
    add("error", "too_long", "The certificate is too large to save. Ask for a simpler design.");
  }

  const used = usedVariables(source);
  const unknownVariables = used.filter((path) => !known.has(path));
  for (const path of unknownVariables) {
    add(
      "warning",
      "unknown_variable",
      `{{ ${path} }} is not a certificate variable, so it prints as a blank. Remove it or use one from the variable list.`
    );
  }
  if (/\{\{\s*#each\b/.test(source)) {
    add("warning", "loop", "It uses a {{#each}} loop, but a certificate has no lists to loop over. Nothing will print there.");
  }

  // Shown as text, not merely mentioned in a condition or tucked into an attribute.
  const namePattern = new RegExp(`\\{\\{\\s*${LEARNER_NAME_VARIABLE}\\s*\\}\\}`);
  const missingLearnerName = !namePattern.test(visibleText(markup));
  if (missingLearnerName) {
    add("error", "missing_learner_name", "The learner's name is not shown. A certificate has to say who it was awarded to.");
  }

  const removed = sanitizerRemovals(options.original ?? source);
  if (removed.length > 0) {
    add("warning", "sanitized", `Not allowed in a certificate, so it was taken out: ${removed.join("; ")}.`);
  }

  if (!used.includes("serial")) {
    add("warning", "no_serial", "The certificate number is not shown, so a printed copy cannot be checked against your records.");
  }
  if (!used.includes("courseTitle") && !used.includes("programmeTitle")) {
    add("warning", "no_title", "It does not say which course or programme was completed.");
  }
  if (!/@page\b/i.test(css)) {
    add("warning", "no_page_rule", "It does not set a paper size, so it may not print on a single sheet the way it looks here.");
  }
  if (/<img\b[^>]*\bsrc\s*=\s*["']?\s*https?:/i.test(markup)) {
    add("warning", "remote_image", "It loads an image from another website. That image can fail to print, and its host sees every learner who opens the certificate.");
  }
  if (/@font-face\b/i.test(css)) {
    add("info", "web_font", "It loads its own font. If the font has not arrived when the print dialog opens, the certificate prints in a fallback.");
  }
  if (options.checkScaling) {
    const fixed = css.match(/\b\d*\.?\d+(?:px|rem|vw|vh)\b/g)?.length ?? 0;
    if (!/container-type\s*:/i.test(css) || fixed > 6) {
      add("info", "fixed_sizes", "Some sizes are fixed rather than relative to the sheet. Check the print preview: text that fits on screen can run off the page on paper.");
    }
  }

  return {
    issues,
    unknownVariables,
    missingLearnerName,
    removed,
    blocked: issues.some((issue) => issue.severity === "error"),
  };
}

/* -------------------------------------------------------------------------- */
/* The whole job                                                               */
/* -------------------------------------------------------------------------- */

/** Room for a detailed certificate with a full stylesheet, and no more. */
const MAX_OUTPUT_TOKENS = 12_000;
const FIRST_CALL_MS = 110_000;
/** Total time one request may spend, so a repair never runs past the route's limit. */
const TOTAL_BUDGET_MS = 165_000;
const MIN_REPAIR_MS = 40_000;

export type CertificateDesignResult = {
  /** The certificate source to put in the editor. */
  html: string;
  report: CertificateReport;
  /** How many model calls were made: 1, or 2 when a correction was needed. */
  attempts: number;
};

type Checked = { html: string; report: CertificateReport };

/** Reply text in; a cleaned certificate and what is wrong with it out. */
export function processCertificateReply(reply: string, options: { checkScaling?: boolean } = {}): Checked {
  const original = extractCertificateHtml(reply);
  const { html } = cleanCertificateSource(original);
  return { html, report: checkCertificateSource(html, { checkScaling: options.checkScaling, original }) };
}

/** Problems worth one more model call: the ones the model caused and can fix. */
function repairList(report: CertificateReport): string[] {
  const problems: string[] = [];
  if (report.missingLearnerName) {
    problems.push(`The learner's name is not shown. Add {{ ${LEARNER_NAME_VARIABLE} }} as the most prominent text.`);
  }
  for (const path of report.unknownVariables) {
    problems.push(`{{ ${path} }} is not an available variable. Remove it, or replace it with one from the list in your instructions.`);
  }
  if (report.issues.some((issue) => issue.code === "loop")) {
    problems.push("Remove the {{#each}} loop. A certificate has no lists.");
  }
  return problems;
}

function severityScore(report: CertificateReport): number {
  return (
    report.issues.filter((issue) => issue.severity === "error").length * 100 +
    report.unknownVariables.length * 10 +
    report.issues.filter((issue) => issue.severity === "warning").length
  );
}

/**
 * Ask the model for a certificate and return it cleaned and checked.
 *
 * Makes one call, and at most one more: if the reply misses the learner's name
 * or uses variables that do not exist, the model is shown exactly what is wrong
 * and asked to fix only that. A failed correction never costs the first answer.
 */
export async function designCertificate(
  agent: Agent,
  request: CertificateDesignRequest,
  context: CertificateDesignContext
): Promise<CertificateDesignResult> {
  const started = Date.now();
  const checkScaling = request.mode === "create";
  const prompt =
    request.mode === "create"
      ? createCertificatePrompt(
          {
            occasion: request.occasion,
            style: request.style ?? null,
            colours: request.colours ?? null,
            orientation: request.orientation,
          },
          context
        )
      : reviseCertificatePrompt({ instruction: request.instruction, currentHtml: request.currentHtml }, context);

  const reply = await generateText(agent, prompt, {
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    timeoutMs: FIRST_CALL_MS,
    maxRetries: 1,
  });

  let best = processCertificateReply(reply, { checkScaling });
  // No markup at all is not a certificate with problems; it is a failed call.
  if (!best.html) throw new AiError("invalid_output", "The reply contained no certificate markup.");

  let attempts = 1;
  const problems = repairList(best.report);
  const remaining = TOTAL_BUDGET_MS - (Date.now() - started);

  if (problems.length > 0 && remaining >= MIN_REPAIR_MS) {
    attempts = 2;
    try {
      const corrected = await generateText(agent, repairCertificatePrompt({ html: best.html, problems }), {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeoutMs: remaining - 5_000,
        maxRetries: 0,
      });
      const second = processCertificateReply(corrected, { checkScaling });
      if (second.html && severityScore(second.report) < severityScore(best.report)) best = second;
    } catch {
      // The first answer stands, with its problems listed for the person to judge.
    }
  }

  return { html: best.html, report: best.report, attempts };
}
