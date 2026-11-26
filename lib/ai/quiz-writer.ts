import type { Agent } from "@mastra/core/agent";
import { generateStructured } from "./run";
import { clip } from "./course-builder-run";
import { lessonHeadings, lessonPlain } from "./lesson-writer";
import { quizFromTransport, quizTransportSchema } from "../schemas/course-builder-transport";
import type { GeneratedQuiz } from "../schemas/course-builder";

/**
 * Writes ONE quiz from the lessons of its module.
 *
 * Shared by the course-builder workflow (one call per quiz, after the module's
 * lessons exist) and by "generate the missing quizzes", which writes the
 * quizzes a run had no time for. Same prompt, same clean-up, either way. No
 * path-alias imports: the workflow imports this relatively.
 */

/** How much of a module's lessons a quiz writer is shown. */
const QUIZ_MATERIAL_CHARS_PER_LESSON = 5_000;
const QUIZ_MATERIAL_CHARS_TOTAL = 18_000;

const QUIZ_MAX_OUTPUT_TOKENS = 8_000;
export const QUIZ_TIMEOUT_MS = 120_000;

/** Why a quiz was not written, in words fit for the course author. */
export const NO_QUIZ_MATERIAL = "The lessons this quiz would test could not be written.";
export const NO_USABLE_QUESTIONS = "The quiz had no usable questions.";

/** One lesson, as the quiz writer is shown it. */
export type QuizMaterial = {
  title: string;
  /** Headings a question can cite as the place its answer is taught. */
  headings: string[];
  text: string;
};

/**
 * A module's written lessons, in order, cut down to what one call can carry.
 * A lesson with nothing in it (it failed, or is a video or file) is left out:
 * a quiz may only ask about what learners can actually read.
 */
export function quizMaterial(
  lessons: readonly { title: string; body: string | null; html: string | null }[]
): QuizMaterial[] {
  let budget = QUIZ_MATERIAL_CHARS_TOTAL;
  return lessons.flatMap((lesson) => {
    if (budget <= 0) return [];
    const plain = lessonPlain({ body: lesson.body, html: lesson.html });
    if (!plain) return [];
    const text = clip(plain, Math.min(QUIZ_MATERIAL_CHARS_PER_LESSON, budget));
    budget -= text.length;
    return [{ title: lesson.title, headings: lesson.html ? lessonHeadings(lesson.html) : [], text }];
  });
}

export type QuizBrief = {
  /** The author's request (see `describeCourseRequest`), without its source text. */
  requestSummary: string;
  moduleTitle: string;
  /** The title of the quiz lesson. Also the quiz's title if the model gives none. */
  quizTitle: string;
  /** What the quiz should check, from the outline. */
  synopsis?: string | null;
  /** The module's lessons, exactly as learners will read them. Not empty. */
  material: QuizMaterial[];
  allowEssays: boolean;
  /** The author's pass mark; the model is never asked for one. */
  passMark: number | null;
  /** Less than the usual two minutes when the run is nearly out of time. */
  timeoutMs?: number;
};

export function quizPrompt(brief: QuizBrief): string {
  const lessons = brief.material
    .map(
      (m) =>
        `### Lesson: ${m.title}\nHeadings in this lesson:\n${
          m.headings.length ? m.headings.map((h) => `- ${h}`).join("\n") : "(none)"
        }\n\n${m.text}`
    )
    .join("\n\n");

  return `Write ONE quiz for a course module.

${brief.requestSummary}

Module: "${brief.moduleTitle}"
Quiz lesson title: "${brief.quizTitle}"${brief.synopsis ? `\nWhat it should check: ${brief.synopsis}` : ""}

The module's lessons, exactly as learners will read them, are below. Ask ONLY about what these
lessons actually teach.

${lessons}

Rules for this quiz:
- 4 to 8 questions, unless the structure hints ask for a different number. Mix the question types.
- Every question must be answerable from the lessons above.
- For each question set sourceLessonTitle to the EXACT title of the lesson it tests (copied from a
  "### Lesson:" line above), sourceHeading to the EXACT text of the heading it was drawn from
  (copied from that lesson's heading list, or "" if the lesson has none), and sourceQuote to a
  short phrase copied word-for-word from that passage. A learner who gets the question wrong is
  sent to that heading to read up, so these must point at where the answer is taught.
- hint: one sentence that points the learner toward how to think about the question WITHOUT
  stating or paraphrasing the answer, and without repeating a correct option. Use "" if no fair
  hint exists.
- options, correctOptionIndexes and acceptedAnswers follow the hard rules in your instructions;
  use empty arrays where a field does not apply, and rubric = null for every non-essay question.
- Do not set a pass mark; the course author chooses it.`;
}

/**
 * Throws `AiError` when the call fails. Returns null when the reply had no
 * usable question left after clean-up (see `quizFromTransport`), which the
 * caller reports as `NO_USABLE_QUESTIONS`.
 */
export async function writeQuiz(agent: Agent, brief: QuizBrief): Promise<GeneratedQuiz | null> {
  const raw = await generateStructured(agent, quizPrompt(brief), {
    schema: quizTransportSchema,
    maxOutputTokens: QUIZ_MAX_OUTPUT_TOKENS,
    timeoutMs: brief.timeoutMs ?? QUIZ_TIMEOUT_MS,
    maxRetries: 2,
  });
  return quizFromTransport(raw, {
    allowEssays: brief.allowEssays,
    passMark: brief.passMark,
    fallbackTitle: brief.quizTitle,
  });
}
