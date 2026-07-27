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
 */
export const questionTypeSchema = z.enum([
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "SHORT_ANSWER",
  "ESSAY",
]);

export type QuestionTypeValue = z.infer<typeof questionTypeSchema>;

/** Question types whose `answerJson` holds option indices into `optionsJson`. */
export const CHOICE_QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
] as const satisfies readonly QuestionTypeValue[];

export function isChoiceQuestion(type: QuestionTypeValue): boolean {
  return (CHOICE_QUESTION_TYPES as readonly string[]).includes(type);
}
