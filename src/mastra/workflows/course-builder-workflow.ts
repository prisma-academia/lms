import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
// Relative imports throughout — see the path-alias note in lib/schemas/course-builder.ts.
import {
  courseBuilderInputSchema,
  courseOutlineSchema,
  courseTemplateSchema,
  generatedCourseSchema,
  generatedQuizSchema,
  type CourseOutline,
  type GeneratedCourse,
  type GeneratedLesson,
} from '../../../lib/schemas/course-builder';
import { outlineFromTransport, outlineTransportSchema } from '../../../lib/schemas/course-builder-transport';
import { AiError, classifyAiError, generateStructured, type AiErrorCode } from '../../../lib/ai/run';
import { LESSON_TIMEOUT_MS, writeLesson } from '../../../lib/ai/lesson-writer';
import {
  NO_QUIZ_MATERIAL,
  NO_USABLE_QUESTIONS,
  QUIZ_TIMEOUT_MS,
  quizMaterial,
  writeQuiz,
} from '../../../lib/ai/quiz-writer';
import {
  OUT_OF_TIME,
  builderDeadline,
  callTimeout,
  describeCourseRequest,
} from '../../../lib/ai/course-builder-run';

/**
 * AI course generation.
 *
 *   outline ─▶ one call per lesson ─▶ one call per quiz ─▶ assemble
 *
 * This used to be one call per MODULE, returning every lesson's HTML and the
 * module's quiz inside a single JSON object. That shape failed in three ways at
 * once: the reply was long enough to be cut off, a single bad escape in any
 * lesson's markup lost the whole module, and the quiz was written in the same
 * breath as the lessons, so it could not point at what they actually said.
 *
 * Now each lesson is its own short, plain-text reply, and a quiz is written
 * after its module's lessons exist — it is given their real headings and can
 * say which one each question came from.
 *
 * A lesson or quiz that fails does NOT fail the run. The step reports the
 * failure in its output, the course is assembled from what succeeded, and the
 * caller is told what is missing. Only "nothing could be written at all" is an
 * error, and it carries the real reason.
 */

/** Lessons are independent; a handful at once keeps a course inside one request. */
const LESSON_CONCURRENCY = 5;
const QUIZ_CONCURRENCY = 3;

/*
 * How long a run may take — when it stops starting model calls, and how long a
 * call started late is allowed — is decided in lib/ai/course-builder-run.ts,
 * next to the route limit it has to fit inside.
 */

function outlineSummary(o: CourseOutline): string {
  return o.groups
    .map(
      (g, i) =>
        `${i + 1}. ${g.title}\n${g.lessons.map((l) => `   - [${l.contentType}] ${l.title}`).join('\n')}`
    )
    .join('\n');
}

/* -------------------------------------------------------------------------- */
/* Step contracts                                                              */
/* -------------------------------------------------------------------------- */

const outlineStepOutputSchema = z.object({
  input: courseBuilderInputSchema,
  outline: courseOutlineSchema.nullable(),
  /** Set when the source JSON already matches the course template — no AI needed. */
  fastPathCourse: generatedCourseSchema.nullable(),
  /** Epoch ms after which no new model call is started. */
  deadlineAt: z.number(),
});

const lessonJobSchema = z.object({
  input: courseBuilderInputSchema,
  outline: courseOutlineSchema,
  groupIndex: z.number(),
  lessonIndex: z.number(),
  deadlineAt: z.number(),
});

const lessonDraftSchema = z.object({
  groupIndex: z.number(),
  lessonIndex: z.number(),
  /** Lesson title, for progress messages. */
  title: z.string(),
  ok: z.boolean(),
  body: z.string().nullable(),
  html: z.string().nullable(),
  /** Why it failed, in words fit for the course author. Null when ok. */
  error: z.string().nullable(),
  errorCode: z.string().nullable(),
});

const quizJobSchema = z.object({
  input: courseBuilderInputSchema,
  outline: courseOutlineSchema,
  groupIndex: z.number(),
  lessonIndex: z.number(),
  deadlineAt: z.number(),
  /** The module's lessons as written: what the quiz is allowed to ask about. */
  material: z.array(
    z.object({
      title: z.string(),
      headings: z.array(z.string()),
      text: z.string(),
    })
  ),
});

const quizDraftSchema = z.object({
  groupIndex: z.number(),
  lessonIndex: z.number(),
  title: z.string(),
  ok: z.boolean(),
  quiz: generatedQuizSchema.nullable(),
  error: z.string().nullable(),
  errorCode: z.string().nullable(),
});

const warningSchema = z.object({
  kind: z.enum(['lesson', 'quiz']),
  module: z.string(),
  title: z.string(),
  reason: z.string(),
});

export const courseBuilderOutputSchema = z.object({
  course: generatedCourseSchema,
  /** Things the author should know were left out or left empty. */
  warnings: z.array(warningSchema).default([]),
});

type LessonDraft = z.infer<typeof lessonDraftSchema>;
type QuizDraft = z.infer<typeof quizDraftSchema>;
type OutlineStepOutput = z.infer<typeof outlineStepOutputSchema>;
export type CourseBuilderWarning = z.infer<typeof warningSchema>;

function failure(e: unknown): { error: string; errorCode: AiErrorCode } {
  const error = classifyAiError(e);
  return { error: error.userMessage, errorCode: error.code };
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                       */
/* -------------------------------------------------------------------------- */

const generateOutline = createStep({
  id: 'generate-outline',
  description: 'Designs the course outline (modules, lesson titles, types and briefs) from the request',
  inputSchema: courseBuilderInputSchema,
  outputSchema: outlineStepOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const input = inputData;
    const deadlineAt = builderDeadline();

    // Fast path: an exact course-template JSON import needs no AI at all.
    if (input.mode === 'adapt-json' && input.sourceJson) {
      try {
        const parsed = courseTemplateSchema.safeParse(JSON.parse(input.sourceJson));
        if (parsed.success) {
          return {
            input,
            outline: null,
            fastPathCourse: { courseSummary: parsed.data.courseSummary, groups: parsed.data.groups },
            deadlineAt,
          };
        }
      } catch {
        // Not valid JSON at all — fall through to AI adaptation.
      }
    }

    const agent = mastra?.getAgent('courseBuilderAgent');
    if (!agent) throw new Error('Course builder agent not found');

    const prompt = `Design the outline for a course.

${describeCourseRequest(input, { full: true })}

Produce only the outline: modules in teaching order, and for each lesson its title, contentType,
a 1-3 sentence synopsis of what it must cover, and an estimated durationMin (0 if you cannot
estimate). Do not write the lesson content yet. Lesson titles within a course must be unique:
quiz questions will later be traced back to a lesson by its title.`;

    const raw = await generateStructured(agent, prompt, {
      schema: outlineTransportSchema,
      maxOutputTokens: 8_000,
      timeoutMs: 120_000,
      maxRetries: 2,
    });

    const outline = outlineFromTransport(raw, { allowPlaceholders: input.allowPlaceholders });
    if (!outline) throw new AiError('invalid_output', 'The outline had no usable modules.');

    return { input, outline, fastPathCourse: null, deadlineAt };
  },
});

const writeLessonStep = createStep({
  id: 'write-lesson',
  description: 'Writes the content of one TEXT or HTML lesson',
  inputSchema: lessonJobSchema,
  outputSchema: lessonDraftSchema,
  execute: async ({ inputData, mastra }) => {
    const { input, outline, groupIndex, lessonIndex, deadlineAt } = inputData;
    const group = outline.groups[groupIndex];
    const lesson = group.lessons[lessonIndex];
    const base = { groupIndex, lessonIndex, title: lesson.title };
    const failed = (error: string, errorCode: string) => ({
      ...base,
      ok: false,
      body: null,
      html: null,
      error,
      errorCode,
    });

    const timeoutMs = callTimeout(deadlineAt, LESSON_TIMEOUT_MS);
    if (timeoutMs === null) return failed(OUT_OF_TIME, 'timeout');

    const agent = mastra?.getAgent('courseBuilderAgent');
    if (!agent) return failed('Course builder agent not found.', 'unknown');

    try {
      const written = await writeLesson(agent, {
        timeoutMs,
        courseContext: `${describeCourseRequest(input, { full: false })}

Full course outline (for context — write content ONLY for the one lesson named below):
${outlineSummary(outline)}`,
        title: lesson.title,
        contentType: lesson.contentType === 'TEXT' ? 'TEXT' : 'HTML',
        moduleTitle: group.title,
        synopsis: lesson.synopsis,
        durationMin: lesson.durationMin,
      });
      return { ...base, ok: true, body: written.body, html: written.html, error: null, errorCode: null };
    } catch (e) {
      const { error, errorCode } = failure(e);
      return failed(error, errorCode);
    }
  },
});

const writeQuizStep = createStep({
  id: 'write-quiz',
  description: 'Writes one quiz from the lessons of its module',
  inputSchema: quizJobSchema,
  outputSchema: quizDraftSchema,
  execute: async ({ inputData, mastra }) => {
    const { input, outline, groupIndex, lessonIndex, deadlineAt, material } = inputData;
    const group = outline.groups[groupIndex];
    const lesson = group.lessons[lessonIndex];
    const base = { groupIndex, lessonIndex, title: lesson.title };
    const failed = (error: string, errorCode: string) => ({ ...base, ok: false, quiz: null, error, errorCode });

    if (material.length === 0) return failed(NO_QUIZ_MATERIAL, 'invalid_output');
    const timeoutMs = callTimeout(deadlineAt, QUIZ_TIMEOUT_MS);
    if (timeoutMs === null) return failed(OUT_OF_TIME, 'timeout');

    const agent = mastra?.getAgent('courseBuilderAgent');
    if (!agent) return failed('Course builder agent not found.', 'unknown');

    try {
      // The same call "generate the missing quizzes" makes afterwards for a
      // quiz this run had no time for (lib/courses/missing-quizzes.ts).
      const quiz = await writeQuiz(agent, {
        requestSummary: describeCourseRequest({ ...input, sourceMaterial: null, sourceJson: null }, { full: false }),
        moduleTitle: group.title,
        quizTitle: lesson.title,
        synopsis: lesson.synopsis,
        material,
        allowEssays: input.allowEssays,
        passMark: input.quizPassMark,
        timeoutMs,
      });
      if (!quiz) return failed(NO_USABLE_QUESTIONS, 'invalid_output');
      return { ...base, ok: true, quiz, error: null, errorCode: null };
    } catch (e) {
      const { error, errorCode } = failure(e);
      return failed(error, errorCode);
    }
  },
});

const assembleCourse = createStep({
  id: 'assemble-course',
  description: 'Assembles the written lessons and quizzes into a course, or returns the fast-path template',
  inputSchema: z.array(quizDraftSchema),
  outputSchema: courseBuilderOutputSchema,
  execute: async ({ inputData, getStepResult }) => {
    const outlineResult = getStepResult(generateOutline) as OutlineStepOutput;

    if (outlineResult.fastPathCourse) {
      return { course: generatedCourseSchema.parse(outlineResult.fastPathCourse), warnings: [] };
    }

    const outline = outlineResult.outline;
    if (!outline) throw new Error('Outline not found');

    // For a step run by `.foreach`, the result is the array of every iteration's
    // output (the step's own type says "one"; the engine hands back all of them).
    const lessonDrafts = ((getStepResult(writeLessonStep) as unknown) ?? []) as LessonDraft[];
    const quizDrafts = (inputData ?? []) as QuizDraft[];
    const key = (g: number, l: number) => `${g}:${l}`;
    const lessonByKey = new Map(lessonDrafts.map((d) => [key(d.groupIndex, d.lessonIndex), d] as const));
    const quizByKey = new Map(quizDrafts.map((d) => [key(d.groupIndex, d.lessonIndex), d] as const));

    // If not a single lesson could be written, there is no course to hand back —
    // and every failure almost certainly has the same cause (no key, no credit,
    // provider down). Fail with that cause rather than return an empty shell.
    const wanted = lessonDrafts.length;
    const written = lessonDrafts.filter((d) => d.ok).length;
    if (wanted > 0 && written === 0) {
      const first = lessonDrafts[0];
      throw new AiError((first.errorCode ?? 'unknown') as AiErrorCode, first.error ?? undefined);
    }

    const warnings: CourseBuilderWarning[] = [];
    const groups: GeneratedCourse['groups'] = [];

    outline.groups.forEach((group, groupIndex) => {
      const lessons: GeneratedLesson[] = [];

      group.lessons.forEach((planned, lessonIndex) => {
        const shared = { title: planned.title, durationMin: planned.durationMin };

        if (planned.contentType === 'TEXT' || planned.contentType === 'HTML') {
          const draft = lessonByKey.get(key(groupIndex, lessonIndex));
          if (draft?.ok) {
            lessons.push({
              ...shared,
              contentType: planned.contentType,
              body: draft.body,
              html: draft.html,
              quiz: null,
              placeholderNote: null,
            });
          } else {
            // Keep the lesson in place, empty, so the course keeps its shape and
            // the author can fill this one in with "write with AI" afterwards.
            const reason = draft?.error ?? 'This lesson was not written.';
            warnings.push({ kind: 'lesson', module: group.title, title: planned.title, reason });
            lessons.push({
              ...shared,
              contentType: planned.contentType,
              body: null,
              html: null,
              quiz: null,
              placeholderNote: `Not written yet — ${reason}`,
            });
          }
          return;
        }

        if (planned.contentType === 'QUIZ') {
          const draft = quizByKey.get(key(groupIndex, lessonIndex));
          if (draft?.ok && draft.quiz) {
            lessons.push({
              ...shared,
              contentType: 'QUIZ',
              body: null,
              html: null,
              quiz: draft.quiz,
              placeholderNote: null,
            });
          } else {
            // A quiz lesson with no quiz cannot be applied, so it is left out.
            warnings.push({
              kind: 'quiz',
              module: group.title,
              title: planned.title,
              reason: draft?.error ?? 'This quiz was not written.',
            });
          }
          return;
        }

        // VIDEO_URL / FILE: nothing to write. The outline's brief says what the
        // author should attach.
        lessons.push({
          ...shared,
          contentType: planned.contentType,
          body: null,
          html: null,
          quiz: null,
          placeholderNote: planned.synopsis || 'Attach the media for this lesson.',
        });
      });

      if (lessons.length > 0) groups.push({ title: group.title, lessons });
    });

    if (groups.length === 0) throw new AiError('invalid_output', 'No lessons could be assembled.');

    return {
      course: generatedCourseSchema.parse({ courseSummary: outline.courseSummary, groups }),
      warnings,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Workflow                                                                    */
/* -------------------------------------------------------------------------- */

const courseBuilderWorkflow = createWorkflow({
  id: 'course-builder-workflow',
  inputSchema: courseBuilderInputSchema,
  outputSchema: courseBuilderOutputSchema,
})
  .then(generateOutline)
  // One job per lesson that has content to write. Fast path: no jobs at all.
  .map(async ({ inputData }) => {
    const { input, outline, fastPathCourse, deadlineAt } = inputData as OutlineStepOutput;
    if (fastPathCourse) return [];
    if (!outline) throw new Error('Outline not found');
    return outline.groups.flatMap((group, groupIndex) =>
      group.lessons.flatMap((lesson, lessonIndex) =>
        lesson.contentType === 'TEXT' || lesson.contentType === 'HTML'
          ? [{ input, outline, groupIndex, lessonIndex, deadlineAt }]
          : []
      )
    );
  })
  .foreach(writeLessonStep, { concurrency: LESSON_CONCURRENCY })
  // One job per quiz, carrying the lessons of its module as they were written.
  .map(async ({ inputData, getStepResult }) => {
    const { input, outline, fastPathCourse, deadlineAt } = getStepResult(generateOutline) as OutlineStepOutput;
    if (fastPathCourse || !outline) return [];
    const drafts = (inputData ?? []) as LessonDraft[];

    return outline.groups.flatMap((group, groupIndex) => {
      const material = quizMaterial(
        drafts.filter((d) => d.groupIndex === groupIndex && d.ok).sort((a, b) => a.lessonIndex - b.lessonIndex)
      );

      return group.lessons.flatMap((lesson, lessonIndex) =>
        lesson.contentType === 'QUIZ' ? [{ input, outline, groupIndex, lessonIndex, deadlineAt, material }] : []
      );
    });
  })
  .foreach(writeQuizStep, { concurrency: QUIZ_CONCURRENCY })
  .then(assembleCourse);

courseBuilderWorkflow.commit();

export { courseBuilderWorkflow };
