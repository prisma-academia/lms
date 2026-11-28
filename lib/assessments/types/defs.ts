import { z } from "zod";
import { equivalent, parseNumber, compileMath } from "@/lib/assessments/math-eval";
import {
  clamp01,
  credit,
  keyed,
  normalizeText,
  shuffle,
  type QuestionTypeDef,
} from "./shared";

/**
 * One definition per question type. See `shared.ts` for the contract.
 *
 * Stored shapes are parsed leniently (`.catch`) so a legacy or hand-edited row
 * degrades to "no options" rather than throwing inside a grading run; the
 * authoring routes call `validate` so new rows are always well-formed.
 */

const text = z.string().max(1000);
const optionList = z.array(text).max(26);
const indexList = z.array(z.number().int().min(0).max(99)).max(50);

/* ───────────────────────────── choice ───────────────────────────── */

function choiceView(options: string[], rng: (() => number) | null) {
  return { choices: keyed(options, rng) };
}

const singleChoice: QuestionTypeDef<string[], number[], number[]> = {
  type: "SINGLE_CHOICE",
  label: "Single choice",
  blurb: "Pick one correct option.",
  family: "choice",
  grading: "auto",
  examOnly: false,
  supportsPartialCredit: false,
  options: optionList.catch([]),
  answer: indexList.catch([]),
  response: indexList.max(1),
  defaults: () => ({ options: ["", "", "", ""], answer: [0] }),
  validate(options, answer) {
    if (options.filter((o) => o.trim()).length < 2) return "Add at least two options.";
    if (options.some((o) => !o.trim())) return "Remove empty options.";
    if (answer.length !== 1 || answer[0] >= options.length) return "Mark exactly one correct option.";
    return null;
  },
  grade({ answer }, response) {
    const picked = response?.[0];
    if (picked === undefined) return { fraction: 0, answered: false };
    return { fraction: picked === answer[0] ? 1 : 0, answered: true, detail: { picked } };
  },
  isAnswered: (r) => !!r && r.length > 0,
  candidateView: choiceView,
};

const trueFalse: QuestionTypeDef<string[], number[], number[]> = {
  ...singleChoice,
  type: "TRUE_FALSE",
  label: "True / false",
  blurb: "A statement the candidate marks true or false.",
  defaults: () => ({ options: ["True", "False"], answer: [0] }),
  validate(options, answer) {
    if (options.length !== 2) return "True/false needs exactly two options.";
    if (answer.length !== 1 || answer[0] > 1) return "Mark which one is correct.";
    return null;
  },
  // Never shuffle True/False: "False, True" reads as a trick.
  candidateView: (options) => choiceView(options, null),
};

const multipleChoice: QuestionTypeDef<string[], number[], number[]> = {
  ...singleChoice,
  type: "MULTIPLE_CHOICE",
  label: "Multiple choice",
  blurb: "Select every correct option.",
  supportsPartialCredit: true,
  response: indexList,
  defaults: () => ({ options: ["", "", "", ""], answer: [0, 1] }),
  validate(options, answer) {
    if (options.filter((o) => o.trim()).length < 2) return "Add at least two options.";
    if (options.some((o) => !o.trim())) return "Remove empty options.";
    if (answer.length < 1) return "Mark at least one correct option.";
    if (answer.some((i) => i >= options.length)) return "A correct option no longer exists.";
    return null;
  },
  grade({ answer, partialCredit }, response) {
    const picked = new Set(response ?? []);
    if (picked.size === 0) return { fraction: 0, answered: false };
    const correct = new Set(answer);
    const hits = [...picked].filter((p) => correct.has(p)).length;
    const wrong = picked.size - hits;
    const exact = wrong === 0 && hits === correct.size;
    // Partial credit: right picks earn, wrong picks cost, never below zero —
    // otherwise "tick everything" would be a strategy.
    const fraction = exact ? 1 : partialCredit ? clamp01((hits - wrong) / correct.size) : 0;
    return { fraction, answered: true, detail: { hits, wrong } };
  },
};

/* ───────────────────────────── text ───────────────────────────── */

const shortAnswerOptions = z
  .preprocess(
    // Legacy rows store `[]` here.
    (v) => (Array.isArray(v) || v == null ? {} : v),
    z.object({
      caseSensitive: z.boolean().default(false),
      /** exact | contains (the accepted text appears) | wildcard (* matches anything). */
      mode: z.enum(["exact", "contains", "wildcard"]).default("exact"),
      maxLength: z.number().int().min(1).max(2000).default(300),
    })
  )
  .catch({ caseSensitive: false, mode: "exact", maxLength: 300 });

type ShortAnswerOptions = z.infer<typeof shortAnswerOptions>;

function wildcardMatch(pattern: string, value: string): boolean {
  // Linear-time glob: "*" only. No author-supplied regex reaches the server.
  const parts = pattern.split("*");
  let pos = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0) {
      if (!value.startsWith(part)) return false;
      pos = part.length;
      continue;
    }
    if (i === parts.length - 1) return value.length - part.length >= pos && value.endsWith(part);
    const at = value.indexOf(part, pos);
    if (at < 0) return false;
    pos = at + part.length;
  }
  return pos === value.length;
}

const shortAnswer: QuestionTypeDef<ShortAnswerOptions, string[], string> = {
  type: "SHORT_ANSWER",
  label: "Short answer",
  blurb: "A word or phrase, matched against accepted answers.",
  family: "text",
  grading: "auto",
  examOnly: false,
  supportsPartialCredit: false,
  options: shortAnswerOptions,
  answer: z.array(z.string().max(500)).max(50).catch([]),
  response: z.string().max(2000),
  defaults: () => ({ options: { caseSensitive: false, mode: "exact", maxLength: 300 }, answer: [""] }),
  validate(_o, answer) {
    if (answer.filter((a) => a.trim()).length === 0) return "Add at least one accepted answer.";
    return null;
  },
  grade({ options, answer }, response) {
    const resp = normalizeText(response ?? "", options.caseSensitive);
    if (!resp) return { fraction: 0, answered: false };
    const ok = answer.some((a) => {
      const acc = normalizeText(a, options.caseSensitive);
      if (!acc) return false;
      if (options.mode === "contains") return resp.includes(acc);
      if (options.mode === "wildcard") return wildcardMatch(acc, resp);
      return resp === acc;
    });
    return { fraction: ok ? 1 : 0, answered: true };
  },
  isAnswered: (r) => !!r && r.trim().length > 0,
  candidateView: (o) => ({ maxLength: o.maxLength }),
};

const essay: QuestionTypeDef<unknown, unknown, string> = {
  type: "ESSAY",
  label: "Essay",
  blurb: "Extended writing, marked against a rubric (AI suggests, staff confirm).",
  family: "text",
  grading: "ai",
  examOnly: false,
  supportsPartialCredit: true,
  options: z.unknown(),
  answer: z.unknown(),
  response: z.string().max(20000),
  defaults: () => ({ options: [], answer: [] }),
  validate: () => null,
  grade(_i, response) {
    const answered = !!response && response.trim().length > 0;
    // Graded by the essay grader (quizzes) or the marking queue (exams).
    return { fraction: answered ? null : 0, answered };
  },
  isAnswered: (r) => !!r && r.trim().length > 0,
  candidateView: () => ({}),
};

/* ─────────────────────────── fill in the blanks ─────────────────────────── */

/** Blanks are written into the prompt as [[1]], [[2]] … (or any short id). */
export const BLANK_PATTERN = /\[\[([a-zA-Z0-9_-]{1,12})\]\]/g;

export function blankIdsInPrompt(prompt: string): string[] {
  return [...prompt.matchAll(BLANK_PATTERN)].map((m) => m[1]);
}

const fillBlanksOptions = z
  .object({
    blanks: z
      .array(
        z.object({
          id: z.string().min(1).max(12),
          /** A dropdown instead of a text box. */
          choices: z.array(z.string().max(200)).max(12).nullable().default(null),
        })
      )
      .max(30)
      .default([]),
    caseSensitive: z.boolean().default(false),
  })
  .catch({ blanks: [], caseSensitive: false });

type FillOptions = z.infer<typeof fillBlanksOptions>;

const fillBlanks: QuestionTypeDef<FillOptions, Record<string, string[]>, Record<string, string>> = {
  type: "FILL_BLANKS",
  label: "Fill in the blanks",
  blurb: "Gaps inside a sentence or passage — typed or picked from a list.",
  family: "text",
  grading: "auto",
  examOnly: false,
  supportsPartialCredit: true,
  options: fillBlanksOptions,
  answer: z.record(z.string(), z.array(z.string().max(200)).max(20)).catch({}),
  response: z.record(z.string().max(12), z.string().max(500)),
  defaults: () => ({
    options: { blanks: [{ id: "1", choices: null }], caseSensitive: false },
    answer: { "1": [""] },
  }),
  validate(options, answer, prompt) {
    const ids = blankIdsInPrompt(prompt);
    if (ids.length === 0) return "Write at least one blank into the question, like [[1]].";
    if (new Set(ids).size !== ids.length) return "Each blank id can only appear once.";
    for (const id of ids) {
      const blank = options.blanks.find((b) => b.id === id);
      if (!blank) return `Blank [[${id}]] has no settings.`;
      const accepted = (answer[id] ?? []).filter((a) => a.trim());
      if (accepted.length === 0) return `Blank [[${id}]] needs an accepted answer.`;
      if (blank.choices && accepted.some((a) => !blank.choices!.includes(a))) {
        return `Blank [[${id}]]: the correct answer must be one of its choices.`;
      }
    }
    return null;
  },
  grade({ options, answer, partialCredit, prompt }, response) {
    const ids = blankIdsInPrompt(prompt);
    const resp = response ?? {};
    const filled = ids.filter((id) => (resp[id] ?? "").trim());
    if (filled.length === 0) return { fraction: 0, answered: false };
    const perBlank: Record<string, boolean> = {};
    for (const id of ids) {
      const given = normalizeText(resp[id] ?? "", options.caseSensitive);
      perBlank[id] = !!given && (answer[id] ?? []).some((a) => normalizeText(a, options.caseSensitive) === given);
    }
    const right = Object.values(perBlank).filter(Boolean).length;
    return { fraction: credit(ids.length, right, partialCredit), answered: true, detail: { perBlank } };
  },
  isAnswered: (r) => !!r && Object.values(r).some((v) => v.trim()),
  candidateView: (o, rng) => ({
    caseSensitive: o.caseSensitive,
    blanks: o.blanks.map((b) => ({ id: b.id, choices: b.choices ? shuffle(b.choices, rng) : null })),
  }),
};

/* ───────────────────────────── numeric ───────────────────────────── */

const numeric: QuestionTypeDef<
  { unit: string | null; decimals: number | null },
  { value: number; tolerance: number; mode: "abs" | "pct" },
  string
> = {
  type: "NUMERIC",
  label: "Numeric",
  blurb: "A number, accepted within a tolerance (± absolute or %).",
  family: "text",
  grading: "auto",
  examOnly: false,
  supportsPartialCredit: false,
  options: z
    .object({
      unit: z.string().max(30).nullable().default(null),
      decimals: z.number().int().min(0).max(10).nullable().default(null),
    })
    .catch({ unit: null, decimals: null }),
  answer: z
    .object({
      value: z.number().finite(),
      tolerance: z.number().min(0).default(0),
      mode: z.enum(["abs", "pct"]).default("abs"),
    })
    .catch({ value: 0, tolerance: 0, mode: "abs" }),
  response: z.string().max(100),
  defaults: () => ({ options: { unit: null, decimals: null }, answer: { value: 0, tolerance: 0, mode: "abs" } }),
  validate: (_o, a) => (Number.isFinite(a.value) ? null : "Enter the correct value."),
  grade({ answer }, response) {
    const raw = (response ?? "").trim();
    if (!raw) return { fraction: 0, answered: false };
    const v = parseNumber(raw);
    if (v === null) return { fraction: 0, answered: true, detail: { parsed: null } };
    const allowed = answer.mode === "pct" ? Math.abs(answer.value) * (answer.tolerance / 100) : answer.tolerance;
    // A hair of float slack so 0.1 + 0.2 style answers are not rejected.
    const ok = Math.abs(v - answer.value) <= allowed + 1e-9 * Math.max(1, Math.abs(answer.value));
    return { fraction: ok ? 1 : 0, answered: true, detail: { parsed: v } };
  },
  isAnswered: (r) => !!r && r.trim().length > 0,
  candidateView: (o) => ({ unit: o.unit, decimals: o.decimals }),
};

/* ───────────────────────────── matching ───────────────────────────── */

const matching: QuestionTypeDef<
  { left: string[]; right: string[]; shuffleLeft: boolean },
  number[],
  (number | null)[]
> = {
  type: "MATCHING",
  label: "Matching",
  blurb: "Pair each item on the left with one on the right (extra right items allowed).",
  family: "interactive",
  grading: "auto",
  examOnly: false,
  supportsPartialCredit: true,
  options: z
    .object({
      left: z.array(text).max(20).default([]),
      right: z.array(text).max(26).default([]),
      shuffleLeft: z.boolean().default(false),
    })
    .catch({ left: [], right: [], shuffleLeft: false }),
  answer: indexList.catch([]),
  response: z.array(z.number().int().min(0).max(99).nullable()).max(20),
  defaults: () => ({ options: { left: ["", ""], right: ["", ""], shuffleLeft: false }, answer: [0, 1] }),
  validate(o, a) {
    if (o.left.length < 2) return "Add at least two items to match.";
    if (o.left.some((x) => !x.trim()) || o.right.some((x) => !x.trim())) return "Remove empty items.";
    if (o.right.length < o.left.length) return "There must be at least as many right items as left items.";
    if (a.length !== o.left.length || a.some((i) => i >= o.right.length)) return "Choose the match for every left item.";
    return null;
  },
  grade({ options, answer, partialCredit }, response) {
    const resp = response ?? [];
    if (!resp.some((r) => r !== null && r !== undefined)) return { fraction: 0, answered: false };
    const perPair = options.left.map((_, i) => resp[i] === answer[i]);
    const right = perPair.filter(Boolean).length;
    return { fraction: credit(options.left.length, right, partialCredit), answered: true, detail: { perPair } };
  },
  isAnswered: (r) => !!r && r.some((x) => x !== null && x !== undefined),
  candidateView: (o, rng) => ({
    left: keyed(o.left, o.shuffleLeft ? rng : null),
    right: keyed(o.right, rng),
  }),
};

/* ───────────────────────────── ordering ───────────────────────────── */

const ordering: QuestionTypeDef<{ items: string[] }, unknown, number[]> = {
  type: "ORDERING",
  label: "Ordering",
  blurb: "Drag items into the right sequence. Write them here in the correct order.",
  family: "interactive",
  grading: "auto",
  examOnly: false,
  supportsPartialCredit: true,
  options: z.object({ items: z.array(text).max(20).default([]) }).catch({ items: [] }),
  answer: z.unknown(),
  response: indexList.max(20),
  defaults: () => ({ options: { items: ["", "", ""] }, answer: {} }),
  validate(o) {
    if (o.items.length < 2) return "Add at least two items.";
    if (o.items.some((x) => !x.trim())) return "Remove empty items.";
    return null;
  },
  grade({ options, partialCredit }, response) {
    const n = options.items.length;
    const resp = response ?? [];
    if (resp.length === 0) return { fraction: 0, answered: false };
    const valid = resp.length === n && new Set(resp).size === n;
    if (!valid) return { fraction: 0, answered: true };
    const exact = resp.every((k, i) => k === i);
    if (exact) return { fraction: 1, answered: true };
    // Partial: share of neighbouring pairs that are in the right relative order.
    let pairs = 0;
    for (let i = 0; i + 1 < n; i++) if (resp[i + 1] === resp[i] + 1) pairs++;
    return { fraction: partialCredit ? clamp01(pairs / (n - 1)) : 0, answered: true, detail: { pairs } };
  },
  isAnswered: (r) => !!r && r.length > 0,
  candidateView(o, rng) {
    let items = keyed(o.items, rng ?? (() => 0.5));
    // A "shuffle" that lands on the answer gives the marks away: rotate it.
    if (items.length > 1 && items.every((it, i) => it.key === i)) items = [...items.slice(1), items[0]];
    return { items };
  },
};

/* ───────────────────────────── categorize ───────────────────────────── */

const categorize: QuestionTypeDef<{ categories: string[]; items: string[] }, number[], (number | null)[]> = {
  type: "CATEGORIZE",
  label: "Categorise (drag & drop)",
  blurb: "Drag each item into the group it belongs to.",
  family: "interactive",
  grading: "auto",
  examOnly: false,
  supportsPartialCredit: true,
  options: z
    .object({ categories: z.array(text).max(8).default([]), items: z.array(text).max(30).default([]) })
    .catch({ categories: [], items: [] }),
  answer: indexList.catch([]),
  response: z.array(z.number().int().min(0).max(20).nullable()).max(30),
  defaults: () => ({ options: { categories: ["", ""], items: ["", "", ""] }, answer: [0, 1, 0] }),
  validate(o, a) {
    if (o.categories.length < 2) return "Add at least two groups.";
    if (o.items.length < 2) return "Add at least two items.";
    if ([...o.categories, ...o.items].some((x) => !x.trim())) return "Remove empty entries.";
    if (a.length !== o.items.length || a.some((c) => c >= o.categories.length)) return "Choose a group for every item.";
    return null;
  },
  grade({ options, answer, partialCredit }, response) {
    const resp = response ?? [];
    if (!resp.some((r) => r !== null && r !== undefined)) return { fraction: 0, answered: false };
    const perItem = options.items.map((_, i) => resp[i] === answer[i]);
    const right = perItem.filter(Boolean).length;
    return { fraction: credit(options.items.length, right, partialCredit), answered: true, detail: { perItem } };
  },
  isAnswered: (r) => !!r && r.some((x) => x !== null && x !== undefined),
  candidateView: (o, rng) => ({ categories: keyed(o.categories, null), items: keyed(o.items, rng) }),
};

/* ───────────────────────────── hotspot ───────────────────────────── */

const region = z.discriminatedUnion("shape", [
  z.object({
    shape: z.literal("rect"),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    w: z.number().min(0).max(100),
    h: z.number().min(0).max(100),
  }),
  z.object({
    shape: z.literal("ellipse"),
    cx: z.number().min(0).max(100),
    cy: z.number().min(0).max(100),
    rx: z.number().min(0).max(100),
    ry: z.number().min(0).max(100),
  }),
]);
export type HotspotRegion = z.infer<typeof region>;

export function pointInRegion(p: { x: number; y: number }, r: HotspotRegion): boolean {
  if (r.shape === "rect") return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  if (r.rx === 0 || r.ry === 0) return false;
  const dx = (p.x - r.cx) / r.rx;
  const dy = (p.y - r.cy) / r.ry;
  return dx * dx + dy * dy <= 1;
}

const hotspot: QuestionTypeDef<
  { imageUrl: string; alt: string },
  { regions: HotspotRegion[] },
  { x: number; y: number }
> = {
  type: "HOTSPOT",
  label: "Hotspot (click the image)",
  blurb: "The candidate clicks the right place on a picture or diagram.",
  family: "interactive",
  grading: "auto",
  examOnly: false,
  supportsPartialCredit: false,
  options: z
    .object({ imageUrl: z.string().max(2000).default(""), alt: z.string().max(300).default("") })
    .catch({ imageUrl: "", alt: "" }),
  answer: z.object({ regions: z.array(region).max(10).default([]) }).catch({ regions: [] }),
  response: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
  defaults: () => ({ options: { imageUrl: "", alt: "" }, answer: { regions: [] } }),
  validate(o, a) {
    if (!/^https?:\/\//.test(o.imageUrl)) return "Upload or link the image.";
    if (a.regions.length === 0) return "Draw at least one correct region on the image.";
    return null;
  },
  grade({ answer }, response) {
    if (!response) return { fraction: 0, answered: false };
    const hit = answer.regions.some((r) => pointInRegion(response, r));
    return { fraction: hit ? 1 : 0, answered: true };
  },
  isAnswered: (r) => !!r,
  candidateView: (o) => ({ imageUrl: o.imageUrl, alt: o.alt }),
};

/* ───────────────────────────── matrix ───────────────────────────── */

const matrix: QuestionTypeDef<
  { rows: string[]; columns: string[]; multiple: boolean },
  number[][],
  number[][]
> = {
  type: "MATRIX",
  label: "Matrix / grid",
  blurb: "Rows of statements, a choice in each row (true/false per statement, Likert…).",
  family: "interactive",
  grading: "auto",
  examOnly: false,
  supportsPartialCredit: true,
  options: z
    .object({
      rows: z.array(text).max(20).default([]),
      columns: z.array(z.string().max(100)).max(8).default([]),
      multiple: z.boolean().default(false),
    })
    .catch({ rows: [], columns: [], multiple: false }),
  answer: z.array(z.array(z.number().int().min(0).max(8)).max(8)).max(20).catch([]),
  response: z.array(z.array(z.number().int().min(0).max(8)).max(8)).max(20),
  defaults: () => ({ options: { rows: ["", ""], columns: ["True", "False"], multiple: false }, answer: [[0], [1]] }),
  validate(o, a) {
    if (o.rows.length < 1) return "Add at least one row.";
    if (o.columns.length < 2) return "Add at least two columns.";
    if ([...o.rows, ...o.columns].some((x) => !x.trim())) return "Remove empty rows or columns.";
    if (a.length !== o.rows.length || a.some((r) => r.length === 0 || r.some((c) => c >= o.columns.length))) {
      return "Mark the correct column in every row.";
    }
    if (!o.multiple && a.some((r) => r.length !== 1)) return "Each row takes exactly one answer (or allow several).";
    return null;
  },
  grade({ options, answer, partialCredit }, response) {
    const resp = response ?? [];
    if (!resp.some((r) => r && r.length > 0)) return { fraction: 0, answered: false };
    const perRow = options.rows.map((_, i) => {
      const want = new Set(answer[i] ?? []);
      const got = new Set(resp[i] ?? []);
      return want.size === got.size && [...want].every((x) => got.has(x));
    });
    const right = perRow.filter(Boolean).length;
    return { fraction: credit(options.rows.length, right, partialCredit), answered: true, detail: { perRow } };
  },
  isAnswered: (r) => !!r && r.some((row) => row && row.length > 0),
  candidateView: (o) => ({ rows: o.rows, columns: o.columns, multiple: o.multiple }),
};

/* ───────────────────────────── equation ───────────────────────────── */

const equation: QuestionTypeDef<
  { placeholder: string | null },
  { accepted: string[]; mode: "equivalent" | "exact"; tolerance: number },
  string
> = {
  type: "EQUATION",
  label: "Equation / maths",
  blurb: "A typed maths answer. Any equivalent form is accepted (2x+2 = 2(x+1)).",
  family: "text",
  grading: "auto",
  examOnly: false,
  supportsPartialCredit: false,
  options: z.object({ placeholder: z.string().max(100).nullable().default(null) }).catch({ placeholder: null }),
  answer: z
    .object({
      accepted: z.array(z.string().max(500)).max(10).default([]),
      mode: z.enum(["equivalent", "exact"]).default("equivalent"),
      tolerance: z.number().min(0).max(1).default(1e-6),
    })
    .catch({ accepted: [], mode: "equivalent", tolerance: 1e-6 }),
  response: z.string().max(500),
  defaults: () => ({ options: { placeholder: null }, answer: { accepted: [""], mode: "equivalent", tolerance: 1e-6 } }),
  validate(_o, a) {
    const accepted = a.accepted.filter((x) => x.trim());
    if (accepted.length === 0) return "Add the correct expression.";
    if (a.mode === "equivalent") {
      for (const x of accepted) {
        try {
          compileMath(x);
        } catch {
          return `"${x}" is not maths the checker can read. Use exact matching, or rewrite it.`;
        }
      }
    }
    return null;
  },
  grade({ answer }, response) {
    const raw = (response ?? "").trim();
    if (!raw) return { fraction: 0, answered: false };
    const squash = (s: string) => s.replace(/\s+/g, "").replace(/\\left|\\right/g, "").toLowerCase();
    const ok = answer.accepted.some((acc) =>
      answer.mode === "exact" ? squash(acc) === squash(raw) : squash(acc) === squash(raw) || equivalent(acc, raw, { tolerance: answer.tolerance })
    );
    return { fraction: ok ? 1 : 0, answered: true };
  },
  isAnswered: (r) => !!r && r.trim().length > 0,
  candidateView: (o) => ({ placeholder: o.placeholder }),
};

/* ───────────────────────────── staff-marked ───────────────────────────── */

const uploadResponse = z.object({
  key: z.string().min(1).max(500),
  name: z.string().max(300),
  size: z.number().int().min(0),
  type: z.string().max(120),
});

function manualGrade<R>(isAnswered: (r: R | undefined) => boolean) {
  return (_i: unknown, response: R | undefined) => {
    const answered = isAnswered(response);
    return { fraction: answered ? null : 0, answered };
  };
}

const fileUpload: QuestionTypeDef<{ accept: string[]; maxMb: number }, unknown, z.infer<typeof uploadResponse>> = {
  type: "FILE_UPLOAD",
  label: "File upload",
  blurb: "The candidate uploads a PDF or photo of their working. Marked by staff.",
  family: "media",
  grading: "manual",
  examOnly: true,
  supportsPartialCredit: true,
  options: z
    .object({
      accept: z.array(z.string().max(60)).max(10).default(["application/pdf", "image/*"]),
      maxMb: z.number().int().min(1).max(50).default(10),
    })
    .catch({ accept: ["application/pdf", "image/*"], maxMb: 10 }),
  answer: z.unknown(),
  response: uploadResponse,
  defaults: () => ({ options: { accept: ["application/pdf", "image/*"], maxMb: 10 }, answer: {} }),
  validate: () => null,
  grade: manualGrade((r) => !!r?.key),
  isAnswered: (r) => !!r?.key,
  candidateView: (o) => ({ accept: o.accept, maxMb: o.maxMb }),
};

const audioResponse: QuestionTypeDef<{ maxSec: number }, unknown, z.infer<typeof uploadResponse> & { durationSec?: number }> = {
  type: "AUDIO_RESPONSE",
  label: "Spoken answer (audio)",
  blurb: "The candidate records an answer — orals, languages, interviews. Marked by staff.",
  family: "media",
  grading: "manual",
  examOnly: true,
  supportsPartialCredit: true,
  options: z.object({ maxSec: z.number().int().min(10).max(900).default(120) }).catch({ maxSec: 120 }),
  answer: z.unknown(),
  response: uploadResponse.extend({ durationSec: z.number().min(0).max(3600).optional() }),
  defaults: () => ({ options: { maxSec: 120 }, answer: {} }),
  validate: () => null,
  grade: manualGrade((r) => !!r?.key),
  isAnswered: (r) => !!r?.key,
  candidateView: (o) => ({ maxSec: o.maxSec }),
};

const code: QuestionTypeDef<{ language: string; starter: string }, { keywords: string[] }, string> = {
  type: "CODE",
  label: "Code",
  blurb: "Write code in an editor. Never run — staff mark it, with optional keyword hints.",
  family: "text",
  grading: "manual",
  examOnly: true,
  supportsPartialCredit: true,
  options: z
    .object({ language: z.string().max(30).default("python"), starter: z.string().max(5000).default("") })
    .catch({ language: "python", starter: "" }),
  answer: z.object({ keywords: z.array(z.string().max(100)).max(30).default([]) }).catch({ keywords: [] }),
  response: z.string().max(20000),
  defaults: () => ({ options: { language: "python", starter: "" }, answer: { keywords: [] } }),
  validate: () => null,
  grade({ answer }, response) {
    const src = (response ?? "").trim();
    if (!src) return { fraction: 0, answered: false };
    const found = answer.keywords.filter((k) => k && src.includes(k));
    // Never final: the keyword share is only a hint for the marker.
    return {
      fraction: null,
      answered: true,
      detail: answer.keywords.length ? { suggested: found.length / answer.keywords.length, found } : undefined,
    };
  },
  isAnswered: (r) => !!r && r.trim().length > 0,
  candidateView: (o) => ({ language: o.language, starter: o.starter }),
};

export const DEFINITIONS = [
  singleChoice,
  multipleChoice,
  trueFalse,
  shortAnswer,
  essay,
  fillBlanks,
  numeric,
  matching,
  ordering,
  categorize,
  hotspot,
  matrix,
  equation,
  fileUpload,
  audioResponse,
  code,
] as QuestionTypeDef[];
