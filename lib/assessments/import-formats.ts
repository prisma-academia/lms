import type { QuestionTypeValue } from "@/lib/schemas/question";
import { questionTypeSchema } from "@/lib/schemas/question";

/**
 * Reading and writing question banks in the formats teachers already have:
 *
 *  - Aiken   (plain text, single-choice; Moodle, many CBT tools)
 *  - GIFT    (Moodle's text format: choice, multi, T/F, short, numeric, matching, essay)
 *  - CSV     (spreadsheet: one row per question, see CSV_COLUMNS)
 *  - JSON    (this platform's own lossless export)
 *
 * Parsers are hand-written and linear; nothing here evaluates input. Every
 * parsed question is still validated by the registry before it is stored.
 */

export type ImportedQuestion = {
  type: QuestionTypeValue;
  prompt: string;
  options?: unknown;
  answer?: unknown;
  rubric?: unknown;
  points?: number;
  difficulty?: "EASY" | "MEDIUM" | "HARD" | null;
  explanation?: string | null;
  hint?: string | null;
  partialCredit?: boolean;
  negativePoints?: number | null;
  tags?: string[];
};

export type ParseIssue = { item: number; line?: number; message: string };
export type ParseResult = { questions: (ImportedQuestion & { sourceLine?: number })[]; issues: ParseIssue[] };

export type ImportFormat = "aiken" | "gift" | "csv" | "json";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/* ───────────────────────────── Aiken ───────────────────────────── */

export function parseAiken(text: string): ParseResult {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const questions: ParseResult["questions"] = [];
  const issues: ParseIssue[] = [];
  let prompt: string[] = [];
  let options: string[] = [];
  let startLine = 0;

  const reset = () => {
    prompt = [];
    options = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      if (prompt.length && options.length === 0) continue; // blank inside a long prompt
      continue;
    }
    const opt = /^([A-Z])[.)]\s+(.*)$/.exec(line);
    const ans = /^ANSWER:\s*([A-Z](?:\s*[,;]\s*[A-Z])*)\s*$/i.exec(line);
    if (ans) {
      const item = questions.length + issues.length + 1;
      if (!prompt.length || options.length < 2) {
        issues.push({ item, line: i + 1, message: "ANSWER without a question and at least two options." });
        reset();
        continue;
      }
      const picks = ans[1].toUpperCase().split(/[,;]/).map((s) => LETTERS.indexOf(s.trim()));
      if (picks.some((p) => p < 0 || p >= options.length)) {
        issues.push({ item, line: i + 1, message: `Answer ${ans[1]} is not one of the options.` });
        reset();
        continue;
      }
      questions.push({
        type: picks.length > 1 ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE",
        prompt: prompt.join("\n").trim(),
        options: [...options],
        answer: [...new Set(picks)].sort((a, b) => a - b),
        sourceLine: startLine,
      });
      reset();
      continue;
    }
    if (opt && prompt.length) {
      const expected = LETTERS[options.length];
      if (opt[1] !== expected) {
        // Not the next letter: treat as part of the prompt (e.g. "A) is wrong").
        if (options.length === 0) {
          prompt.push(line);
          continue;
        }
      }
      options.push(opt[2].trim());
      continue;
    }
    if (options.length) {
      issues.push({ item: questions.length + issues.length + 1, line: i + 1, message: "Expected the next option or ANSWER: line." });
      reset();
    }
    if (!prompt.length) startLine = i + 1;
    prompt.push(line);
  }
  if (prompt.length && options.length) {
    issues.push({ item: questions.length + issues.length + 1, line: startLine, message: "The last question has no ANSWER: line." });
  }
  return { questions, issues };
}

export function toAiken(qs: { type: QuestionTypeValue; prompt: string; options: unknown; answer: unknown }[]): string {
  return qs
    .filter((q) => q.type === "SINGLE_CHOICE" || q.type === "TRUE_FALSE" || q.type === "MULTIPLE_CHOICE")
    .map((q) => {
      const opts = Array.isArray(q.options) ? (q.options as string[]) : [];
      const ans = Array.isArray(q.answer) ? (q.answer as number[]) : [];
      return [
        q.prompt.replace(/\n+/g, " "),
        ...opts.map((o, i) => `${LETTERS[i]}. ${o}`),
        `ANSWER: ${ans.map((a) => LETTERS[a]).join(",")}`,
      ].join("\n");
    })
    .join("\n\n");
}

/* ───────────────────────────── GIFT ───────────────────────────── */

function giftUnescape(s: string): string {
  return s.replace(/\\([~=#{}:\\])/g, "$1").trim();
}

/** Split GIFT text on unescaped `{` … `}`; returns [before, inside, after] or null. */
function giftBraces(s: string): [string, string, string] | null {
  let open = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s[i] === "{" && open < 0) open = i;
    else if (s[i] === "}" && open >= 0) return [s.slice(0, open), s.slice(open + 1, i), s.slice(i + 1)];
  }
  return null;
}

/** Split answer text into tokens starting with an unescaped = ~ or #. */
function giftTokens(inner: string): { mark: string; text: string }[] {
  const out: { mark: string; text: string }[] = [];
  let cur: { mark: string; text: string } | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "\\") {
      if (cur) cur.text += c + (inner[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === "=" || c === "~") {
      if (cur) out.push(cur);
      cur = { mark: c, text: "" };
      continue;
    }
    if (!cur) cur = { mark: "", text: "" };
    cur.text += c;
  }
  if (cur) out.push(cur);
  return out
    .map((t) => ({ mark: t.mark, text: t.text.replace(/#[^#]*$/, "") })) // drop per-answer feedback
    .filter((t) => t.mark || t.text.trim());
}

export function parseGift(text: string): ParseResult {
  const questions: ParseResult["questions"] = [];
  const issues: ParseIssue[] = [];
  const clean = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
  const blocks = clean.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  blocks.forEach((block, n) => {
    const item = n + 1;
    if (/^\$CATEGORY:/i.test(block)) return;
    let body = block;
    const title = /^::([\s\S]*?)::/.exec(body);
    if (title) body = body.slice(title[0].length);
    body = body.replace(/^\[(html|moodle|plain|markdown)\]/i, "");
    const parts = giftBraces(body);
    if (!parts) {
      issues.push({ item, message: "No answer block { … } found." });
      return;
    }
    const [before, innerRaw, after] = parts;
    const prompt = giftUnescape(`${before} ${after.trim() ? "_____ " + after : ""}`).replace(/\s+_____\s*$/, "");
    const inner = innerRaw.trim();
    if (!prompt) {
      issues.push({ item, message: "Question text is empty." });
      return;
    }
    // Essay
    if (inner === "") {
      questions.push({
        type: "ESSAY",
        prompt,
        rubric: {
          criteria: [{ id: "c_overall", label: "Answers the question", description: "", weight: 1 }],
          modelAnswer: null,
          minWords: null,
          maxWords: null,
        },
      });
      return;
    }
    // True / false
    if (/^(T|TRUE|F|FALSE)\b/i.test(inner)) {
      const isTrue = /^(T|TRUE)\b/i.test(inner);
      questions.push({ type: "TRUE_FALSE", prompt, options: ["True", "False"], answer: [isTrue ? 0 : 1] });
      return;
    }
    // Numeric
    if (inner.startsWith("#")) {
      const m = /^#\s*(-?[\d.]+)\s*(?::\s*([\d.]+)|\.\.\s*(-?[\d.]+))?/.exec(inner.split(/[=~]/)[0] || inner);
      if (!m) {
        issues.push({ item, message: "Could not read the numeric answer." });
        return;
      }
      const value = Number(m[1]);
      let tolerance = m[2] ? Number(m[2]) : 0;
      let centre = value;
      if (m[3]) {
        // #min..max range form
        const max = Number(m[3]);
        centre = (value + max) / 2;
        tolerance = Math.abs(max - value) / 2;
      }
      questions.push({ type: "NUMERIC", prompt, options: { unit: null, decimals: null }, answer: { value: centre, tolerance, mode: "abs" } });
      return;
    }
    const tokens = giftTokens(inner);
    // Matching: =a -> b
    if (tokens.length >= 2 && tokens.every((t) => t.mark === "=" && t.text.includes("->"))) {
      const pairs = tokens.map((t) => t.text.split("->").map(giftUnescape));
      questions.push({
        type: "MATCHING",
        prompt,
        options: { left: pairs.map((p) => p[0]), right: pairs.map((p) => p[1]), shuffleLeft: false },
        answer: pairs.map((_, i) => i),
      });
      return;
    }
    const right = tokens.filter((t) => t.mark === "=");
    const wrong = tokens.filter((t) => t.mark === "~");
    // Short answer: only "=" answers.
    if (wrong.length === 0 && right.length >= 1) {
      questions.push({
        type: "SHORT_ANSWER",
        prompt,
        options: { caseSensitive: false, mode: "exact", maxLength: 300 },
        answer: right.map((t) => giftUnescape(t.text)),
      });
      return;
    }
    // Multiple answers use weights: ~%50%a ~%50%b ~%-100%c
    const weighted = wrong.filter((t) => /^%-?\d+(\.\d+)?%/.test(t.text.trim()));
    if (right.length === 0 && weighted.length > 0) {
      const options = wrong.map((t) => giftUnescape(t.text.trim().replace(/^%-?[\d.]+%/, "")));
      const answer = wrong
        .map((t, i) => (/^%[1-9][\d.]*%/.test(t.text.trim()) ? i : -1))
        .filter((i) => i >= 0);
      questions.push({ type: "MULTIPLE_CHOICE", prompt, options, answer, partialCredit: true });
      return;
    }
    if (right.length === 1 && wrong.length >= 1) {
      const all = tokens.filter((t) => t.mark);
      questions.push({
        type: "SINGLE_CHOICE",
        prompt,
        options: all.map((t) => giftUnescape(t.text)),
        answer: [all.findIndex((t) => t.mark === "=")],
      });
      return;
    }
    issues.push({ item, message: "This GIFT question type is not supported." });
  });
  return { questions, issues };
}

function giftEscape(s: string): string {
  return s.replace(/([~=#{}:\\])/g, "\\$1");
}

export function toGift(qs: { type: QuestionTypeValue; prompt: string; options: unknown; answer: unknown }[]): string {
  const out: string[] = [];
  for (const q of qs) {
    const p = giftEscape(q.prompt);
    const opts = Array.isArray(q.options) ? (q.options as string[]) : [];
    const ans = q.answer;
    switch (q.type) {
      case "SINGLE_CHOICE":
        out.push(`${p} {\n${opts.map((o, i) => `${(ans as number[])[0] === i ? "=" : "~"}${giftEscape(o)}`).join("\n")}\n}`);
        break;
      case "MULTIPLE_CHOICE": {
        const right = new Set(ans as number[]);
        const w = right.size ? Math.floor(100 / right.size) : 0;
        out.push(`${p} {\n${opts.map((o, i) => `~%${right.has(i) ? w : -100}%${giftEscape(o)}`).join("\n")}\n}`);
        break;
      }
      case "TRUE_FALSE":
        out.push(`${p} {${(ans as number[])[0] === 0 ? "T" : "F"}}`);
        break;
      case "SHORT_ANSWER":
        out.push(`${p} {${(ans as string[]).map((a) => `=${giftEscape(a)}`).join(" ")}}`);
        break;
      case "NUMERIC": {
        const a = ans as { value: number; tolerance: number };
        out.push(`${p} {#${a.value}:${a.tolerance ?? 0}}`);
        break;
      }
      case "MATCHING": {
        const o = q.options as { left: string[]; right: string[] };
        const a = ans as number[];
        out.push(`${p} {\n${o.left.map((l, i) => `=${giftEscape(l)} -> ${giftEscape(o.right[a[i]] ?? "")}`).join("\n")}\n}`);
        break;
      }
      case "ESSAY":
        out.push(`${p} {}`);
        break;
      default:
        // No GIFT equivalent; the JSON export keeps it.
        break;
    }
  }
  return out.join("\n\n");
}

/* ───────────────────────────── CSV ───────────────────────────── */

/**
 * type, prompt, options, answer, points, difficulty, explanation, tags
 *
 * - options: separated by "|"
 * - answer: choice → letters ("B" or "A|C"); true/false → "true"/"false";
 *   short answer → accepted answers separated by "|"; numeric → "9.81" or
 *   "9.81±0.05" (or "9.81+-0.05"); equation → accepted forms separated by "|";
 *   ordering → leave empty (options are in the correct order).
 * - tags: separated by "|"
 */
export const CSV_COLUMNS = ["type", "prompt", "options", "answer", "points", "difficulty", "explanation", "tags"] as const;

/** RFC 4180-ish: quotes, doubled quotes, newlines inside quotes. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const TYPE_ALIASES: Record<string, QuestionTypeValue> = {
  single: "SINGLE_CHOICE", mcq: "SINGLE_CHOICE", "single choice": "SINGLE_CHOICE", objective: "SINGLE_CHOICE",
  multiple: "MULTIPLE_CHOICE", "multi": "MULTIPLE_CHOICE", "multiple choice": "MULTIPLE_CHOICE",
  tf: "TRUE_FALSE", "true/false": "TRUE_FALSE", truefalse: "TRUE_FALSE",
  short: "SHORT_ANSWER", "short answer": "SHORT_ANSWER",
  essay: "ESSAY", theory: "ESSAY",
  numeric: "NUMERIC", number: "NUMERIC",
  ordering: "ORDERING", order: "ORDERING", sequence: "ORDERING",
  equation: "EQUATION", maths: "EQUATION", math: "EQUATION",
  fill: "FILL_BLANKS", cloze: "FILL_BLANKS", "fill in the blanks": "FILL_BLANKS",
};

function csvType(raw: string): QuestionTypeValue | null {
  const t = raw.trim();
  const up = t.toUpperCase().replace(/[\s/-]+/g, "_");
  const direct = questionTypeSchema.safeParse(up);
  if (direct.success) return direct.data;
  return TYPE_ALIASES[t.toLowerCase()] ?? null;
}

const split = (s: string) => s.split("|").map((x) => x.trim()).filter(Boolean);

export function parseCsv(text: string): ParseResult {
  const rows = parseCsvRows(text);
  const questions: ParseResult["questions"] = [];
  const issues: ParseIssue[] = [];
  if (rows.length === 0) return { questions, issues: [{ item: 0, message: "The file is empty." }] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes("prompt") || header.includes("question");
  const col = (name: string, fallback: number) => {
    const alt = name === "prompt" ? "question" : name;
    const i = header.indexOf(name) >= 0 ? header.indexOf(name) : header.indexOf(alt);
    return hasHeader ? i : fallback;
  };
  const idx = Object.fromEntries(CSV_COLUMNS.map((c, i) => [c, col(c, i)])) as Record<(typeof CSV_COLUMNS)[number], number>;
  const body = hasHeader ? rows.slice(1) : rows;

  body.forEach((r, n) => {
    const item = n + 1;
    const line = n + (hasHeader ? 2 : 1);
    const get = (c: (typeof CSV_COLUMNS)[number]) => (idx[c] >= 0 ? (r[idx[c]] ?? "").trim() : "");
    const type = csvType(get("type") || "single");
    const prompt = get("prompt");
    if (!type) return issues.push({ item, line, message: `Unknown question type "${get("type")}".` });
    if (!prompt) return issues.push({ item, line, message: "The question text is empty." });
    const options = split(get("options"));
    const answerRaw = get("answer");
    const base = {
      prompt,
      points: get("points") ? Math.max(0, parseInt(get("points"), 10) || 1) : undefined,
      difficulty: (["EASY", "MEDIUM", "HARD"].includes(get("difficulty").toUpperCase())
        ? get("difficulty").toUpperCase()
        : null) as ImportedQuestion["difficulty"],
      explanation: get("explanation") || null,
      tags: split(get("tags")),
      sourceLine: line,
    };
    switch (type) {
      case "SINGLE_CHOICE":
      case "MULTIPLE_CHOICE": {
        const picks = split(answerRaw.replace(/,/g, "|")).map((a) =>
          /^\d+$/.test(a) ? Number(a) - 1 : LETTERS.indexOf(a.toUpperCase())
        );
        const chosen = [...new Set(picks)].sort((a, b) => a - b);
        questions.push({
          ...base,
          type: type === "SINGLE_CHOICE" && chosen.length > 1 ? "MULTIPLE_CHOICE" : type,
          options,
          answer: chosen,
        });
        break;
      }
      case "TRUE_FALSE":
        questions.push({ ...base, type, options: ["True", "False"], answer: [/^(t|true|yes|1)$/i.test(answerRaw) ? 0 : 1] });
        break;
      case "SHORT_ANSWER":
        questions.push({ ...base, type, options: { caseSensitive: false, mode: "exact", maxLength: 300 }, answer: split(answerRaw) });
        break;
      case "NUMERIC": {
        const m = /^\s*(-?[\d.]+(?:e-?\d+)?)\s*(?:(?:±|\+-|\+\/-)\s*([\d.]+)(%)?)?\s*$/i.exec(answerRaw);
        if (!m) return issues.push({ item, line, message: `Numeric answer "${answerRaw}" is not a number.` });
        questions.push({
          ...base,
          type,
          options: { unit: options[0] ?? null, decimals: null },
          answer: { value: Number(m[1]), tolerance: m[2] ? Number(m[2]) : 0, mode: m[3] ? "pct" : "abs" },
        });
        break;
      }
      case "ORDERING":
        questions.push({ ...base, type, options: { items: options }, answer: {} });
        break;
      case "EQUATION":
        questions.push({ ...base, type, options: { placeholder: null }, answer: { accepted: split(answerRaw), mode: "equivalent", tolerance: 1e-6 } });
        break;
      case "FILL_BLANKS": {
        // Blanks are [[1]], [[2]] in the prompt; answers per blank separated by "|", alternatives by "/".
        const ids = [...prompt.matchAll(/\[\[([a-zA-Z0-9_-]{1,12})\]\]/g)].map((m) => m[1]);
        const per = answerRaw.split("|").map((a) => a.split("/").map((x) => x.trim()).filter(Boolean));
        questions.push({
          ...base,
          type,
          options: { blanks: ids.map((id) => ({ id, choices: null })), caseSensitive: false },
          answer: Object.fromEntries(ids.map((id, i) => [id, per[i] ?? []])),
        });
        break;
      }
      case "ESSAY":
        questions.push({
          ...base,
          type,
          rubric: {
            criteria: [{ id: "c_overall", label: "Answers the question", description: answerRaw, weight: 1 }],
            modelAnswer: null,
            minWords: null,
            maxWords: null,
          },
        });
        break;
      default:
        issues.push({ item, line, message: `${type} cannot be imported from CSV yet — use JSON.` });
    }
  });
  return { questions, issues };
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(
  qs: {
    type: QuestionTypeValue;
    prompt: string;
    options: unknown;
    answer: unknown;
    points: number;
    difficulty: string | null;
    explanation: string | null;
    tags: string[];
  }[]
): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const q of qs) {
    let options = "";
    let answer = "";
    const o = q.options;
    const a = q.answer;
    switch (q.type) {
      case "SINGLE_CHOICE":
      case "MULTIPLE_CHOICE":
        options = ((o as string[]) ?? []).join("|");
        answer = ((a as number[]) ?? []).map((i) => LETTERS[i]).join("|");
        break;
      case "TRUE_FALSE":
        answer = (a as number[])?.[0] === 0 ? "true" : "false";
        break;
      case "SHORT_ANSWER":
        answer = ((a as string[]) ?? []).join("|");
        break;
      case "NUMERIC": {
        const n = a as { value: number; tolerance: number; mode: string };
        options = (o as { unit?: string | null })?.unit ?? "";
        answer = `${n.value}${n.tolerance ? `±${n.tolerance}${n.mode === "pct" ? "%" : ""}` : ""}`;
        break;
      }
      case "ORDERING":
        options = ((o as { items: string[] })?.items ?? []).join("|");
        break;
      case "EQUATION":
        answer = ((a as { accepted: string[] })?.accepted ?? []).join("|");
        break;
      case "FILL_BLANKS": {
        const blanks = (o as { blanks: { id: string }[] })?.blanks ?? [];
        answer = blanks.map((b) => ((a as Record<string, string[]>)?.[b.id] ?? []).join("/")).join("|");
        break;
      }
      default:
        continue; // Not representable in CSV; JSON export has it.
    }
    lines.push(
      [q.type, q.prompt, options, answer, String(q.points), q.difficulty ?? "", q.explanation ?? "", q.tags.join("|")]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\r\n");
}

/* ───────────────────────────── JSON ───────────────────────────── */

export function parseJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { questions: [], issues: [{ item: 0, message: "This is not valid JSON." }] };
  }
  const list = Array.isArray(data) ? data : (data as { questions?: unknown[] })?.questions;
  if (!Array.isArray(list)) return { questions: [], issues: [{ item: 0, message: 'Expected an array, or { "questions": [...] }.' }] };
  const questions: ParseResult["questions"] = [];
  const issues: ParseIssue[] = [];
  list.forEach((raw, n) => {
    const q = raw as Record<string, unknown>;
    const type = questionTypeSchema.safeParse(q?.type);
    if (!type.success || typeof q.prompt !== "string" || !q.prompt.trim()) {
      issues.push({ item: n + 1, message: "Each question needs a valid type and a prompt." });
      return;
    }
    questions.push({
      type: type.data,
      prompt: q.prompt,
      options: q.options,
      answer: q.answer,
      rubric: q.rubric,
      points: typeof q.points === "number" ? q.points : undefined,
      difficulty: (["EASY", "MEDIUM", "HARD"].includes(String(q.difficulty)) ? q.difficulty : null) as ImportedQuestion["difficulty"],
      explanation: typeof q.explanation === "string" ? q.explanation : null,
      hint: typeof q.hint === "string" ? q.hint : null,
      partialCredit: q.partialCredit === true,
      negativePoints: typeof q.negativePoints === "number" ? q.negativePoints : null,
      tags: Array.isArray(q.tags) ? (q.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
    });
  });
  return { questions, issues };
}

export function parseImport(format: ImportFormat, text: string): ParseResult {
  if (format === "aiken") return parseAiken(text);
  if (format === "gift") return parseGift(text);
  if (format === "csv") return parseCsv(text);
  return parseJson(text);
}
