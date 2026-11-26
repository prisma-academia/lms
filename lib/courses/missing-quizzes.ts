import type { Agent } from "@mastra/core/agent";
import { classifyAiError } from "../ai/run";
import { OUT_OF_TIME, builderDeadline, callTimeout, describeCourseRequest } from "../ai/course-builder-run";
import {
  NO_QUIZ_MATERIAL,
  NO_USABLE_QUESTIONS,
  QUIZ_TIMEOUT_MS,
  quizMaterial,
  writeQuiz,
} from "../ai/quiz-writer";
import type { CourseBuilderInput, GeneratedCourse, GeneratedQuiz } from "../schemas/course-builder";
import type { CourseBuilderWarningEvent } from "../schemas/course-builder-progress";

/**
 * Writes the quizzes a course-builder run left out, into the draft.
 *
 * A long course can use its whole time allowance on lessons; the quizzes, which
 * are written last, are then skipped and listed as warnings. This does only
 * that last part again: for each missing quiz, one model call that is shown the
 * module's lessons as they stand in the draft — the same call, with the same
 * prompt, that the workflow would have made (lib/ai/quiz-writer.ts).
 *
 * The result is the draft with the quiz lessons added at the end of their
 * modules. Nothing is saved here: the author still reviews the draft and adds
 * it to the course through the ordinary apply path
 * (lib/courses/apply-generated-course.ts), which is what turns each question's
 * "where this was taught" into a real lesson link. The pass mark and the hint
 * clean-up are `quizFromTransport`'s, as for any generated quiz.
 *
 * No database and no path-alias imports, so `npm run verify:ai` can run it
 * against a stubbed model.
 */

const QUIZ_CONCURRENCY = 3;

export type MissingQuiz = {
  /** Title of the module the quiz belongs to, as the warning gave it. */
  module: string;
  /** Title of the quiz lesson. */
  title: string;
};

export type MissingQuizResult = {
  /** A copy of the draft with the written quizzes added. The input is not changed. */
  course: GeneratedCourse;
  written: number;
  /** One per quiz that is still missing, with the reason. */
  warnings: CourseBuilderWarningEvent[];
  /** The first failure's cause (`credits`, `timeout`, …), for a caller that got nothing at all. */
  firstErrorCode: string | null;
};

type Outcome =
  | { kind: "written"; quiz: GeneratedQuiz }
  | { kind: "present" }
  | { kind: "failed"; reason: string; code: string };

// A warning names its module by title, which is all the draft has to go on.
const MODULE_GONE = "Its module is no longer in the draft. It may have been renamed or removed.";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function writeMissingQuizzes(
  agent: Agent,
  opts: {
    course: GeneratedCourse;
    missing: readonly MissingQuiz[];
    /** The request the draft was generated from: topic, audience, hints, essays, pass mark. */
    request: CourseBuilderInput;
    /** Epoch ms after which no new model call is started. Defaults to a full allowance from now. */
    deadlineAt?: number;
    onProgress?: (progress: { completed: number; total: number; title: string; ok: boolean }) => void;
  }
): Promise<MissingQuizResult> {
  const course = structuredClone(opts.course);
  const deadlineAt = opts.deadlineAt ?? builderDeadline();

  // The same quiz asked for twice is written once.
  const missing = opts.missing.filter(
    (m, i, all) => all.findIndex((o) => same(o.module, m.module) && same(o.title, m.title)) === i
  );

  // The source text was for writing the lessons; a quiz is written from the
  // lessons themselves, and must not ask about anything they left out.
  const requestSummary = describeCourseRequest(
    { ...opts.request, sourceMaterial: null, sourceJson: null },
    { full: false }
  );

  const writeOne = async (wanted: MissingQuiz): Promise<Outcome> => {
    const group = course.groups.find((g) => same(g.title, wanted.module));
    if (!group) return { kind: "failed", reason: MODULE_GONE, code: "invalid_output" };
    if (group.lessons.some((l) => l.contentType === "QUIZ" && same(l.title, wanted.title))) {
      return { kind: "present" };
    }

    const material = quizMaterial(
      group.lessons.filter((l) => l.contentType === "TEXT" || l.contentType === "HTML")
    );
    if (material.length === 0) return { kind: "failed", reason: NO_QUIZ_MATERIAL, code: "invalid_output" };

    const timeoutMs = callTimeout(deadlineAt, QUIZ_TIMEOUT_MS);
    if (timeoutMs === null) return { kind: "failed", reason: OUT_OF_TIME, code: "timeout" };

    try {
      const quiz = await writeQuiz(agent, {
        requestSummary,
        moduleTitle: group.title,
        quizTitle: wanted.title,
        material,
        allowEssays: opts.request.allowEssays,
        passMark: opts.request.quizPassMark,
        timeoutMs,
      });
      return quiz
        ? { kind: "written", quiz }
        : { kind: "failed", reason: NO_USABLE_QUESTIONS, code: "invalid_output" };
    } catch (e) {
      const error = classifyAiError(e);
      return { kind: "failed", reason: error.userMessage, code: error.code };
    }
  };

  // A few at a time, like the workflow. Results are kept by position so the
  // draft comes out the same whichever call happens to finish first.
  const outcomes = new Array<Outcome>(missing.length);
  let next = 0;
  let completed = 0;
  const worker = async () => {
    while (next < missing.length) {
      const index = next++;
      const outcome = await writeOne(missing[index]);
      outcomes[index] = outcome;
      completed++;
      opts.onProgress?.({
        completed,
        total: missing.length,
        title: missing[index].title,
        ok: outcome.kind !== "failed",
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(QUIZ_CONCURRENCY, missing.length) }, worker));

  const warnings: CourseBuilderWarningEvent[] = [];
  let written = 0;
  let firstErrorCode: string | null = null;

  // Added only now, after every call: a quiz lesson is never material for
  // another quiz, and the lessons each writer saw are the ones in the draft.
  missing.forEach((wanted, index) => {
    const outcome = outcomes[index];
    if (outcome.kind === "failed") {
      firstErrorCode ??= outcome.code;
      warnings.push({ kind: "quiz", module: wanted.module, title: wanted.title, reason: outcome.reason });
      return;
    }
    if (outcome.kind === "present") return;
    const group = course.groups.find((g) => same(g.title, wanted.module));
    if (!group) return;
    // At the end of its module: a quiz checks what came before it.
    group.lessons.push({
      title: wanted.title,
      contentType: "QUIZ",
      body: null,
      html: null,
      quiz: outcome.quiz,
      durationMin: null,
      placeholderNote: null,
    });
    written++;
  });

  return { course, written, warnings, firstErrorCode };
}
