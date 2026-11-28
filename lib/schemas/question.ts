import { z } from "zod";

/**
 * The single source of truth for question types.
 *
 * This value was previously duplicated as an inline literal union in seven
 * places (both question routes, the course-builder schema, the scorer, the
 * quiz player, the bank editor and the seed catalog). Adding a type meant
 * changing all seven in lockstep; miss one and the mismatch only surfaces at
 * runtime. Import from here instead.
 *
 * Like `course-builder.ts`, this file must stay dependency-free apart from zod:
 * the Next.js app imports it via `@/lib/schemas/question` and Mastra code
 * imports it RELATIVELY, so bundling never depends on tsconfig path aliases.
 * In particular, do NOT re-export `QuestionType` from `lib/generated/prisma` —
 * that would drag the generated client into the Mastra bundle.
 *
 * What each type stores, grades and shows lives in the registry under
 * `lib/assessments/types/`.
 */
export const questionTypeSchema = z.enum([
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "SHORT_ANSWER",
  "ESSAY",
  "FILL_BLANKS",
  "NUMERIC",
  "MATCHING",
  "ORDERING",
  "CATEGORIZE",
  "HOTSPOT",
  "MATRIX",
  "EQUATION",
  "FILE_UPLOAD",
  "AUDIO_RESPONSE",
  "CODE",
]);

export type QuestionTypeValue = z.infer<typeof questionTypeSchema>;

/** The five original types. The AI course builder still writes only these. */
export const CLASSIC_QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "SHORT_ANSWER",
  "ESSAY",
] as const satisfies readonly QuestionTypeValue[];

/** Question types whose `answerJson` holds option indices into `optionsJson`. */
export const CHOICE_QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
] as const satisfies readonly QuestionTypeValue[];

export function isChoiceQuestion(type: QuestionTypeValue): boolean {
  return (CHOICE_QUESTION_TYPES as readonly string[]).includes(type);
}

/**
 * Types a person has to mark. Quizzes grade instantly and gate lessons, so they
 * cannot hold these; exams can, and wait for a marker.
 */
export const MANUAL_QUESTION_TYPES = [
  "FILE_UPLOAD",
  "AUDIO_RESPONSE",
  "CODE",
] as const satisfies readonly QuestionTypeValue[];

export function isManualQuestion(type: QuestionTypeValue): boolean {
  return (MANUAL_QUESTION_TYPES as readonly string[]).includes(type);
}

export const questionDifficultySchema = z.enum(["EASY", "MEDIUM", "HARD"]);
export type QuestionDifficultyValue = z.infer<typeof questionDifficultySchema>;

/**
 * What the AI course builder may write. Its prompts and shapes only cover the
 * classic five; the exam question generator has its own schema per type.
 */
export const classicQuestionTypeSchema = z.enum(CLASSIC_QUESTION_TYPES);
