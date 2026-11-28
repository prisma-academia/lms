import type { QuestionTypeValue } from "@/lib/schemas/question";
import { DEFINITIONS } from "./defs";
import { hashSeed, seededRng, type Grade, type QuestionTypeDef, type Rng } from "./shared";

export type { Grade, QuestionTypeDef, Rng } from "./shared";
export { seededRng, hashSeed, shuffle } from "./shared";
export { blankIdsInPrompt, BLANK_PATTERN, pointInRegion, type HotspotRegion } from "./defs";

/**
 * The question-type registry. Everything that needs to know what a type
 * stores, how it grades or what a candidate may see asks here.
 */

const REGISTRY = new Map<QuestionTypeValue, QuestionTypeDef>(DEFINITIONS.map((d) => [d.type, d]));

export function questionType(type: QuestionTypeValue): QuestionTypeDef {
  const def = REGISTRY.get(type);
  if (!def) throw new Error(`Unknown question type: ${type}`);
  return def;
}

export function allQuestionTypes(): QuestionTypeDef[] {
  return DEFINITIONS;
}

/** The minimum a grader needs from a stored question. */
export type GradableQuestion = {
  type: QuestionTypeValue;
  prompt: string;
  optionsJson: unknown;
  answerJson: unknown;
  partialCredit?: boolean | null;
};

function parsed(q: GradableQuestion) {
  const def = questionType(q.type);
  return {
    def,
    options: def.options.parse(q.optionsJson),
    answer: def.answer.parse(q.answerJson),
  };
}

/** Coerce a raw response into the type's shape; anything invalid is "no answer". */
export function parseResponse(type: QuestionTypeValue, raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;
  const result = questionType(type).response.safeParse(raw);
  return result.success ? result.data : undefined;
}

/** Grade one response. See `Grade.fraction` for what null means. */
export function gradeQuestion(q: GradableQuestion, rawResponse: unknown): Grade {
  const { def, options, answer } = parsed(q);
  const response = parseResponse(q.type, rawResponse);
  return def.grade({ options, answer, partialCredit: !!q.partialCredit, prompt: q.prompt }, response);
}

export function isResponseAnswered(type: QuestionTypeValue, rawResponse: unknown): boolean {
  return questionType(type).isAnswered(parseResponse(type, rawResponse));
}

/**
 * The candidate-safe view of a question's options. `seed` shuffles (exams);
 * null keeps the authored order (quizzes, previews).
 */
export function candidateView(q: GradableQuestion & { id: string }, seed: number | null): unknown {
  const { def, options } = parsed(q);
  const rng: Rng = seed === null ? null : seededRng(hashSeed(seed, q.id));
  return def.candidateView(options, rng);
}

export type AuthoringResult =
  | { ok: true; options: unknown; answer: unknown }
  | { ok: false; message: string };

/**
 * Check what an author submitted before it is stored: both shapes must parse
 * strictly (no lenient fallbacks here) and pass the type's cross-checks.
 */
export function validateAuthoring(
  type: QuestionTypeValue,
  input: { prompt: string; options: unknown; answer: unknown }
): AuthoringResult {
  const def = questionType(type);
  // Strict parse: unwrap the lenient `.catch` by checking the raw parse first.
  const strictOptions = strictParse(def.options, input.options);
  if (!strictOptions.ok) return { ok: false, message: `Options: ${strictOptions.message}` };
  const strictAnswer = strictParse(def.answer, input.answer);
  if (!strictAnswer.ok) return { ok: false, message: `Answer: ${strictAnswer.message}` };
  const message = def.validate(strictOptions.value, strictAnswer.value, input.prompt);
  if (message) return { ok: false, message };
  return { ok: true, options: strictOptions.value, answer: strictAnswer.value };
}

function strictParse(
  schema: QuestionTypeDef["options"],
  value: unknown
): { ok: true; value: unknown } | { ok: false; message: string } {
  // zod's `.catch` swallows errors; reach for the inner schema when present.
  const inner = (schema as unknown as { def?: { innerType?: QuestionTypeDef["options"] }; _def?: { innerType?: QuestionTypeDef["options"] } });
  const strict = inner.def?.innerType ?? inner._def?.innerType ?? schema;
  const r = strict.safeParse(value);
  if (r.success) return { ok: true, value: r.data };
  const issue = r.error.issues[0];
  return { ok: false, message: `${issue.path.join(".") || "value"} — ${issue.message}` };
}

/** Max points a question can lose for a wrong answer, given exam settings. */
export function penaltyFor(
  question: { negativePoints?: number | null },
  points: number,
  examFraction: number | null
): number {
  if (question.negativePoints != null) return Math.max(0, question.negativePoints);
  if (examFraction != null) return Math.max(0, examFraction * points);
  return 0;
}
