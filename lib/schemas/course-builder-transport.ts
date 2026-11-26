import { z } from "zod";
// Sibling imports, not `@/lib/...` — see the path-alias note in ./course-builder.
import { questionTypeSchema } from "./question";
import {
  lessonContentTypeSchema,
  type CourseOutline,
  type GeneratedQuestion,
  type GeneratedQuiz,
} from "./course-builder";

/**
 * What the model is ASKED for, as opposed to what the platform stores.
 *
 * `course-builder.ts` is the storage contract: it carries limits (`max(15)`
 * groups, `min(1)` questions) and nullable-with-default fields because it also
 * validates hand-written imports. Used as the model's output schema, each of
 * those is a way for an otherwise fine reply to fail: a sixteenth module, an
 * empty description, a duration of 0. Native structured output also caps how
 * many optional and nullable fields one schema may have.
 *
 * So the model gets these flat, all-required, limit-free shapes, and the
 * `…FromTransport` functions below turn a reply into the stored shape —
 * trimming, clamping and dropping what is unusable instead of rejecting the
 * whole reply for it.
 */

const MAX_GROUPS = 15;
const MAX_QUESTIONS = 20;

export const outlineTransportSchema = z.object({
  courseSummary: z.string(),
  groups: z.array(
    z.object({
      title: z.string(),
      lessons: z.array(
        z.object({
          title: z.string(),
          contentType: lessonContentTypeSchema,
          synopsis: z.string(),
          /** Minutes; 0 when not estimated. */
          durationMin: z.number(),
        })
      ),
    })
  ),
});

export type OutlineTransport = z.infer<typeof outlineTransportSchema>;

/** Positive whole minutes, or null. */
function minutes(value: number): number | null {
  return Number.isFinite(value) && value >= 1 ? Math.min(600, Math.round(value)) : null;
}

/**
 * Returns null when nothing usable is left (no module with a titled lesson).
 * Placeholder lessons are dropped unless the request allowed them — the model
 * is told not to produce them, and a model can ignore what it is told.
 */
export function outlineFromTransport(
  raw: OutlineTransport,
  opts: { allowPlaceholders: boolean }
): CourseOutline | null {
  const groups = raw.groups
    .map((group) => ({
      title: group.title.trim().slice(0, 200),
      lessons: group.lessons
        .filter((lesson) => lesson.title.trim())
        .filter(
          (lesson) =>
            opts.allowPlaceholders ||
            (lesson.contentType !== "VIDEO_URL" && lesson.contentType !== "FILE")
        )
        .map((lesson) => ({
          title: lesson.title.trim().slice(0, 200),
          contentType: lesson.contentType,
          synopsis: lesson.synopsis.trim(),
          durationMin: minutes(lesson.durationMin),
        })),
    }))
    .filter((group) => group.title && group.lessons.length > 0)
    .slice(0, MAX_GROUPS);

  if (groups.length === 0) return null;
  return { courseSummary: raw.courseSummary.trim() || null, groups };
}

export const quizTransportSchema = z.object({
  title: z.string(),
  /** One sentence on what the quiz checks; empty string when there is nothing to add. */
  description: z.string(),
  questions: z.array(
    z.object({
      type: questionTypeSchema,
      prompt: z.string(),
      /** Option texts for choice questions; empty array otherwise. */
      options: z.array(z.string()),
      /** Zero-based indexes into `options`; empty array for non-choice questions. */
      correctOptionIndexes: z.array(z.number()),
      /** Accepted answers for SHORT_ANSWER; empty array otherwise. */
      acceptedAnswers: z.array(z.string()),
      points: z.number(),
      /** A nudge that does not give the answer away; empty string for none. */
      hint: z.string(),
      /** Exact title of the lesson this question tests; empty string if none. */
      sourceLessonTitle: z.string(),
      /** Exact text of the heading in that lesson it was drawn from; empty string if none. */
      sourceHeading: z.string(),
      /** A short phrase copied from that passage; empty string if none. */
      sourceQuote: z.string(),
      /** ESSAY only; null for every other type. */
      rubric: z
        .object({
          criteria: z.array(
            z.object({
              label: z.string(),
              description: z.string(),
              weight: z.number(),
            })
          ),
          modelAnswer: z.string(),
          /** 0 when there is no minimum. */
          minWords: z.number(),
          /** 0 when there is no maximum. */
          maxWords: z.number(),
        })
        .nullable(),
    })
  ),
});

export type QuizTransport = z.infer<typeof quizTransportSchema>;

function slug(text: string, fallback: string): string {
  const value = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return value || fallback;
}

/**
 * A hint that names the answer is not a hint. Dropped rather than rewritten:
 * no hint is a smaller problem than a leaked answer.
 */
function hintLeaksAnswer(hint: string, answers: string[]): boolean {
  const haystack = hint.toLowerCase();
  return answers
    .map((a) => a.trim().toLowerCase())
    // One- and two-character answers ("A", "No") occur inside ordinary words;
    // matching them would throw away nearly every hint.
    .filter((a) => a.length >= 3)
    .some((a) => haystack.includes(a));
}

type TransportQuestion = QuizTransport["questions"][number];

function questionFromTransport(
  raw: TransportQuestion,
  opts: { allowEssays: boolean }
): GeneratedQuestion | null {
  const prompt = raw.prompt.trim();
  if (!prompt) return null;

  const points = Number.isFinite(raw.points) && raw.points >= 1 ? Math.min(100, Math.round(raw.points)) : 1;
  const sourceLessonTitle = raw.sourceLessonTitle.trim();
  const source = sourceLessonTitle
    ? {
        lessonTitle: sourceLessonTitle,
        heading: raw.sourceHeading.trim() || null,
        quote: raw.sourceQuote.trim().slice(0, 400) || null,
      }
    : null;

  const base = { prompt, points, source };
  const hintText = raw.hint.trim().slice(0, 500);

  if (raw.type === "ESSAY") {
    if (!opts.allowEssays || !raw.rubric) return null;
    const used = new Set<string>();
    const criteria = raw.rubric.criteria
      .filter((c) => c.label.trim())
      .slice(0, 8)
      .map((c, i) => {
        // Criterion ids must be unique: grades are matched to criteria by id.
        let id = slug(c.label, `criterion-${i + 1}`);
        while (used.has(id)) id = `${id.slice(0, 36)}-${i + 1}`;
        used.add(id);
        return {
          id,
          label: c.label.trim().slice(0, 120),
          description: c.description.trim().slice(0, 1000),
          weight: Number.isFinite(c.weight) && c.weight >= 1 ? Math.min(100, Math.round(c.weight)) : 1,
        };
      });
    if (criteria.length === 0) return null;

    const minWords = raw.rubric.minWords >= 1 ? Math.min(5000, Math.round(raw.rubric.minWords)) : null;
    const maxWords = raw.rubric.maxWords >= 1 ? Math.min(20000, Math.round(raw.rubric.maxWords)) : null;
    return {
      ...base,
      type: "ESSAY",
      options: [],
      correctOptionIndexes: [],
      acceptedAnswers: [],
      rubric: {
        criteria,
        modelAnswer: raw.rubric.modelAnswer.trim().slice(0, 8000) || null,
        minWords,
        // A maximum below the minimum would make the question unanswerable.
        maxWords: maxWords != null && minWords != null && maxWords < minWords ? null : maxWords,
      },
      hint: hintText || null,
    };
  }

  if (raw.type === "SHORT_ANSWER") {
    const acceptedAnswers = [...new Set(raw.acceptedAnswers.map((a) => a.trim()).filter(Boolean))];
    if (acceptedAnswers.length === 0) return null;
    return {
      ...base,
      type: "SHORT_ANSWER",
      options: [],
      correctOptionIndexes: [],
      acceptedAnswers,
      rubric: null,
      hint: hintText && !hintLeaksAnswer(hintText, acceptedAnswers) ? hintText : null,
    };
  }

  // Choice questions.
  const options = raw.type === "TRUE_FALSE" ? ["True", "False"] : raw.options.map((o) => o.trim());
  if (options.length < 2 || options.some((o) => !o)) return null;

  const indexes = [
    ...new Set(raw.correctOptionIndexes.filter((i) => Number.isInteger(i) && i >= 0 && i < options.length)),
  ].sort((a, b) => a - b);
  // An index that pointed outside the options means the answer key is wrong,
  // not merely untidy — drop the question rather than guess which was meant.
  if (indexes.length !== new Set(raw.correctOptionIndexes).size) return null;
  if (indexes.length === 0) return null;
  if (raw.type !== "MULTIPLE_CHOICE" && indexes.length !== 1) return null;

  const correctTexts = indexes.map((i) => options[i]);
  return {
    ...base,
    type: raw.type,
    options,
    correctOptionIndexes: indexes,
    acceptedAnswers: [],
    rubric: null,
    hint:
      // True/False answers are words that appear in any sentence; the leak
      // check is meaningless there.
      hintText && (raw.type === "TRUE_FALSE" || !hintLeaksAnswer(hintText, correctTexts))
        ? hintText
        : null,
  };
}

/**
 * Returns null when no usable question is left. Individually broken questions
 * (an out-of-range answer index, an essay when essays were not allowed) are
 * dropped rather than failing the quiz — one bad question out of eight should
 * cost one question.
 */
export function quizFromTransport(
  raw: QuizTransport,
  opts: { allowEssays: boolean; passMark: number | null; fallbackTitle: string }
): GeneratedQuiz | null {
  const questions = raw.questions
    .map((q) => questionFromTransport(q, opts))
    .filter((q): q is GeneratedQuestion => q !== null)
    .slice(0, MAX_QUESTIONS);

  // An essay cannot be the only thing standing between a learner and the next
  // lesson: it is the one question type whose grade depends on a model.
  if (questions.length === 0 || questions.every((q) => q.type === "ESSAY")) return null;

  return {
    title: raw.title.trim() || opts.fallbackTitle,
    description: raw.description.trim() || null,
    passingScore: opts.passMark,
    questions,
  };
}
