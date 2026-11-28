import type { z } from "zod";
import type { QuestionTypeValue } from "@/lib/schemas/question";

/**
 * The contract every question type fulfils. One definition per type, in
 * `defs.ts`; everything else (quiz scoring, exam grading, the API's authoring
 * checks, the candidate payload) goes through `index.ts` and never switches on
 * the type itself.
 *
 * Pure: no Prisma, no React, no I/O. Safe to import from the browser.
 */

/** How a type earns its marks. */
export type GradingMode = "auto" | "ai" | "manual";

export type Grade = {
  /**
   * Credit as 0..1. NULL means "not decidable here": an essay waiting for the
   * AI grader, or an upload waiting for a marker. Never coerce null to zero
   * without saying so — that would fail an honest candidate silently.
   */
  fraction: number | null;
  /** Whether the candidate gave any answer at all (drives negative marking). */
  answered: boolean;
  /** Per-part breakdown for review screens and item analysis. */
  detail?: Record<string, unknown>;
};

export type GradeInput<O, A> = {
  options: O;
  answer: A;
  partialCredit: boolean;
  prompt: string;
};

/** A deterministic 0..1 generator. NULL = do not shuffle. */
export type Rng = (() => number) | null;

export interface QuestionTypeDef<O = unknown, A = unknown, R = unknown> {
  type: QuestionTypeValue;
  label: string;
  /** One line for the type picker. */
  blurb: string;
  family: "choice" | "text" | "interactive" | "media";
  grading: GradingMode;
  /** Cannot appear in a quiz (quizzes must grade instantly). */
  examOnly: boolean;
  supportsPartialCredit: boolean;
  /** Stored `optionsJson`. Lenient: legacy shapes parse to defaults. */
  options: z.ZodType<O>;
  /** Stored `answerJson`. Never leaves the server. */
  answer: z.ZodType<A>;
  /** What a candidate sends. Anything that fails parsing counts as unanswered. */
  response: z.ZodType<R>;
  defaults(): { options: O; answer: A };
  /** Authoring cross-checks the schemas cannot express. A message, or null. */
  validate(options: O, answer: A, prompt: string): string | null;
  grade(input: GradeInput<O, A>, response: R | undefined): Grade;
  isAnswered(response: R | undefined): boolean;
  /**
   * What the candidate is shown: no keys, no accepted answers. Lists come back
   * as `{ key, text }` with `key` the ORIGINAL index, so responses are always
   * in original terms and grading never needs the shuffle.
   */
  candidateView(options: O, rng: Rng): unknown;
}

/* ───────────────────────────── helpers ───────────────────────────── */

export type Keyed = { key: number; text: string };

/** mulberry32 — tiny, fast, good enough for shuffling papers. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed from a string (question id + attempt seed, for example). */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const out = [...list];
  if (!rng) return out;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function keyed(list: readonly string[], rng: Rng): Keyed[] {
  return shuffle(
    list.map((text, key) => ({ key, text })),
    rng
  );
}

/** Lower-case, trimmed, inner whitespace collapsed; optionally keep case. */
export function normalizeText(s: string, caseSensitive = false): string {
  const t = s.normalize("NFKC").trim().replace(/\s+/g, " ");
  return caseSensitive ? t : t.toLowerCase();
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** All-or-nothing unless partial credit is on. */
export function credit(parts: number, correct: number, partial: boolean): number {
  if (parts <= 0) return 0;
  if (correct >= parts) return 1;
  return partial ? clamp01(correct / parts) : 0;
}
