import { z } from "zod";

/**
 * Contract between the essay author, the AI grader and the learner's result.
 *
 * Like `course-builder.ts`, this file must stay dependency-free apart from zod:
 * the Next.js app imports it via `@/lib/schemas/essay-grading` and Mastra code
 * imports it RELATIVELY (`../../../lib/schemas/essay-grading`) so
 * `mastra dev`/`mastra build` bundling never depends on tsconfig path aliases.
 */

export const rubricCriterionSchema = z.object({
  /**
   * Stable slug generated at authoring time. Grades reference criteria by id,
   * so reordering or renaming a criterion never silently re-points an old grade
   * at a different one.
   */
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  /** What earns full marks. The more checkable this is, the fairer the grade. */
  description: z.string().max(1000).default(""),
  /**
   * Relative weight. Normalised at scoring time (wᵢ / Σw), so authors never have
   * to make these sum to 100.
   */
  weight: z.number().int().min(1).max(100),
});

export const essayRubricSchema = z.object({
  criteria: z.array(rubricCriterionSchema).min(1).max(8),
  /** One acceptable answer, not the only one. The grader is told exactly that. */
  modelAnswer: z.string().max(8000).nullable().default(null),
  minWords: z.number().int().min(0).max(5000).nullable().default(null),
  maxWords: z.number().int().min(1).max(20000).nullable().default(null),
});

export const essayGradeSchema = z.object({
  questionId: z.string().min(1),
  criteria: z
    .array(
      z.object({
        /** Must echo a supplied rubric criterion id verbatim. */
        id: z.string().min(1),
        score01: z.number().min(0).max(1),
        comment: z.string().min(1).max(600),
      })
    )
    .min(1),
  /** Learner-facing, 2-4 sentences. Never states the expected answer. */
  feedback: z.string().min(1).max(1500),
  flags: z
    .array(z.enum(["off_topic", "too_short", "possible_plagiarism", "non_answer"]))
    .default([]),
});

/** One grader call per attempt, not per essay — batching keeps latency sane. */
export const essayBatchGradeSchema = z.object({
  grades: z.array(essayGradeSchema).min(1),
});

/**
 * How well one criterion was met. The grader marks on this four-point scale
 * instead of a continuous 0..1 number: the model cannot be pinned to a
 * temperature, and "was it 0.7 or 0.75?" is not a question it answers the same
 * way twice, whereas "mostly or fully met?" it does.
 */
export const ESSAY_LEVELS = ["none", "partial", "mostly", "full"] as const;
export type EssayLevel = (typeof ESSAY_LEVELS)[number];

/** Credit each level earns. `full` must stay exactly 1 — it is what "correct" means. */
export const ESSAY_LEVEL_SCORE: Record<EssayLevel, number> = {
  none: 0,
  partial: 0.5,
  mostly: 0.8,
  full: 1,
};

const ESSAY_FLAGS = ["off_topic", "too_short", "possible_plagiarism", "non_answer"] as const;

/**
 * What the model is asked to return.
 *
 * Deliberately looser than `essayGradeSchema`: every field required, no length
 * or range limits. A limit in the transport schema turns a comment that ran one
 * character long into a failed grading call — and one failed essay used to fail
 * the whole attempt. Limits are applied in `gradeFromTransport` instead, where
 * an over-long comment is trimmed rather than thrown away.
 */
export const essayGradeTransportSchema = z.object({
  grades: z.array(
    z.object({
      questionId: z.string(),
      criteria: z.array(
        z.object({
          id: z.string(),
          level: z.enum(ESSAY_LEVELS),
          comment: z.string(),
        })
      ),
      feedback: z.string(),
      flags: z.array(z.enum(ESSAY_FLAGS)),
    })
  ),
});

export type EssayGradeTransport = z.infer<typeof essayGradeTransportSchema>["grades"][number];

function clip(text: string, max: number, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

/**
 * Turn one transport grade into the stored `EssayGrade` shape.
 *
 * Returns null when there is nothing usable (no question id, or no criterion
 * with an id) — the caller then treats the question as ungraded, which scores 0.
 */
export function gradeFromTransport(raw: EssayGradeTransport): EssayGrade | null {
  const questionId = raw.questionId.trim();
  if (!questionId) return null;

  const criteria = raw.criteria
    .filter((c) => c.id.trim())
    .map((c) => ({
      id: c.id.trim(),
      score01: ESSAY_LEVEL_SCORE[c.level],
      comment: clip(c.comment, 600, "No comment."),
    }));
  if (criteria.length === 0) return null;

  return {
    questionId,
    criteria,
    feedback: clip(raw.feedback, 1500, "No feedback was provided."),
    flags: [...new Set(raw.flags)],
  };
}

export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;
export type EssayRubric = z.infer<typeof essayRubricSchema>;
export type EssayGrade = z.infer<typeof essayGradeSchema>;
export type EssayBatchGrade = z.infer<typeof essayBatchGradeSchema>;

/** Parse a stored `Question.rubricJson`, returning null when it isn't a valid rubric. */
export function parseRubric(value: unknown): EssayRubric | null {
  const result = essayRubricSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Fold a grader's per-criterion scores into a single 0..1 fraction.
 *
 * Fails CLOSED on every disagreement with the rubric: a criterion the grader
 * omitted scores 0, and criteria it invented are discarded. A grader that
 * returns junk must never be able to hand out a pass — completion requires 100%.
 */
export function rubricFraction(rubric: EssayRubric, grade: EssayGrade | null): number {
  const totalWeight = rubric.criteria.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight <= 0) return 0;
  if (!grade) return 0;

  const scoreById = new Map(grade.criteria.map((c) => [c.id, c.score01] as const));
  const earned = rubric.criteria.reduce((sum, c) => {
    const raw = scoreById.get(c.id);
    const score = typeof raw === "number" && Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
    return sum + score * c.weight;
  }, 0);

  return earned / totalWeight;
}
