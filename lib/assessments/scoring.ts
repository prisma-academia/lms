import type { QuestionTypeValue } from "@/lib/schemas/question";
import { parseRubric, rubricFraction, type EssayGrade } from "@/lib/schemas/essay-grading";
import { gradeQuestion } from "@/lib/assessments/types";

export type ScorableQuestion = {
  id: string;
  type: QuestionTypeValue;
  /** Needed by types whose key lives in the prompt (fill in the blanks). */
  prompt?: string;
  optionsJson?: unknown;
  partialCredit?: boolean | null;
  answerJson: unknown;
  /** ESSAY only; the rubric the AI grade was produced against. */
  rubricJson?: unknown;
  points: number;
};

/**
 * A learner's response for one question. Selected option indices or text for
 * the classic types; a type-specific shape for the rest (see the registry in
 * lib/assessments/types). Validated there, so it is opaque here.
 */
export type Response = unknown;

/** Per-question outcome, persisted on the attempt for admin review. */
export type QuestionResult = {
  earned: number;
  points: number;
  correct: boolean;
  /** ESSAY only: learner-facing feedback and the per-criterion breakdown. */
  feedback?: string;
  criteria?: { id: string; label: string; score01: number; comment: string }[];
  /**
   * ESSAY only: identity of the (question, rubric, answer, grader) this grade
   * was produced for. A later attempt with the same key reuses the grade
   * instead of asking the model again — see `essayGradeKey`.
   */
  gradeKey?: string;
};

/**
 * Deterministic credit as a 0..1 fraction.
 *
 * Returns null for ESSAY: those are not locally scorable and their grade must be
 * injected by the caller. Never treat null as zero at the call site without
 * saying so — silently zeroing an ungraded essay would fail an honest learner.
 */
export function gradeObjective(q: ScorableQuestion, response: Response): number | null {
  if (q.type === "ESSAY") return null;
  // Every rule lives in the type registry, shared with exam grading.
  return gradeQuestion(
    {
      type: q.type,
      prompt: q.prompt ?? "",
      optionsJson: q.optionsJson ?? [],
      answerJson: q.answerJson,
      partialCredit: q.partialCredit,
    },
    response
  ).fraction;
}

/** Questions in this quiz that need an AI grade before the score is final. */
export function essayQuestions<T extends { type: QuestionTypeValue }>(questions: T[]): T[] {
  return questions.filter((q) => q.type === "ESSAY");
}

export type EssayGradeMap = Record<string, EssayGrade | null>;

/**
 * Score an attempt. `effectivePoints` overrides a question's own points.
 *
 * Stays SYNCHRONOUS and PURE even though essays are AI-graded: the LLM call
 * happens in the route and its output is injected via `essayGrades`. That keeps
 * Prisma and Mastra out of this module and confines the async boundary to one
 * place, so the scoring rules stay trivially checkable.
 */
export function scoreAttempt(
  questions: (ScorableQuestion & { effectivePoints: number })[],
  answers: Record<string, Response>,
  essayGrades?: EssayGradeMap,
  /** Passed straight through onto each graded essay's result; never read here. */
  essayGradeKeys?: Record<string, string>
): {
  scorePercent: number;
  earned: number;
  total: number;
  perfect: boolean;
  perQuestion: Record<string, boolean>;
  results: Record<string, QuestionResult>;
} {
  let earned = 0;
  let total = 0;
  const perQuestion: Record<string, boolean> = {};
  const results: Record<string, QuestionResult> = {};

  for (const q of questions) {
    total += q.effectivePoints;

    let fraction: number;
    let feedback: string | undefined;
    let criteria: QuestionResult["criteria"];
    let gradeKey: string | undefined;

    if (q.type === "ESSAY") {
      const rubric = parseRubric(q.rubricJson);
      const grade = essayGrades?.[q.id] ?? null;
      // Only a grade that actually exists is worth reusing later.
      gradeKey = grade ? essayGradeKeys?.[q.id] : undefined;
      // No rubric means the question is misauthored. Score 0 rather than
      // guessing — a silent full mark would gate nothing at all.
      fraction = rubric ? rubricFraction(rubric, grade) : 0;
      feedback = grade?.feedback;
      criteria = rubric
        ? rubric.criteria.map((c) => {
            const scored = grade?.criteria.find((g) => g.id === c.id);
            return {
              id: c.id,
              label: c.label,
              score01: scored ? Math.min(1, Math.max(0, scored.score01)) : 0,
              comment: scored?.comment ?? "Not addressed.",
            };
          })
        : undefined;
    } else {
      fraction = gradeObjective(q, answers[q.id]) ?? 0;
    }

    const questionEarned = fraction * q.effectivePoints;
    earned += questionEarned;

    const correct = fraction >= 1 - 1e-9;
    perQuestion[q.id] = correct;
    results[q.id] = {
      earned: Math.round(questionEarned * 1000) / 1000,
      points: q.effectivePoints,
      correct,
      ...(feedback ? { feedback } : {}),
      ...(criteria ? { criteria } : {}),
      ...(gradeKey ? { gradeKey } : {}),
    };
  }

  // `scorePercent === 100` gates lesson completion, so it must mean "everything
  // earned" and nothing else. Rounding alone would promote 0.997 to 100 now that
  // essays contribute fractional credit, handing out a pass for an imperfect
  // attempt. Derive `perfect` from the raw totals and clamp everything else
  // to 99 — keep these two lines together.
  const perfect = total > 0 ? earned >= total - 1e-9 : false;
  const scorePercent =
    total === 0 ? 0 : perfect ? 100 : Math.min(99, Math.round((earned / total) * 100));

  return { scorePercent, earned, total, perfect, perQuestion, results };
}
