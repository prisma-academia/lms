import { isUnlocked } from "@/lib/courses/gating";
import { lessonHeadingsOf } from "@/lib/content/lesson-headings";

/**
 * "Read up on this": where a learner is sent after getting a question wrong.
 *
 * A question may record the lesson, heading and passage it was drawn from. This
 * module decides whether that pointer may be shown to a particular learner, and
 * what it resolves to today — because both can have changed since it was
 * recorded:
 *
 *  - Questions live in banks and are reused. The same question in a second
 *    course must not link into the first course.
 *  - Authors reorder lessons. A source lesson can end up AFTER its quiz, where
 *    the learner has not been yet; linking to it would be a way round the lock.
 *  - Authors edit headings. The anchor may be gone; the lesson is still the
 *    right place, so the link degrades to the passage, then to the lesson top.
 *
 * Pure: the caller supplies the course as the learner currently sees it.
 */

export type ReviewCourseLesson = {
  id: string;
  title: string;
  contentType: string;
  contentJson: unknown;
};

export type ReviewCourse = {
  /** In course order (the order `isUnlocked` expects). */
  lessons: readonly ReviewCourseLesson[];
  completed: ReadonlySet<string>;
};

export type QuestionSource = {
  sourceLessonId: string | null;
  sourceAnchor: string | null;
  sourceExcerpt: string | null;
};

export type ReviewSource = {
  lessonId: string;
  lessonTitle: string;
  /** Heading id inside the lesson, when it still exists. */
  anchor: string | null;
  /** That heading's current text, for the link label. */
  heading: string | null;
  /** A phrase from the passage — used to find it when there is no anchor. */
  excerpt: string | null;
};

/** Only lessons a learner reads can be read up on. */
const READABLE = new Set(["TEXT", "HTML"]);

export function resolveReviewSource(
  question: QuestionSource,
  course: ReviewCourse | null
): ReviewSource | null {
  if (!course || !question.sourceLessonId) return null;

  const lesson = course.lessons.find((l) => l.id === question.sourceLessonId);
  // Not in the course the learner is taking this quiz through: no link.
  if (!lesson || !READABLE.has(lesson.contentType)) return null;
  // Locked for this learner: no link.
  if (!isUnlocked(course.lessons, course.completed, lesson.id)) return null;

  const heading = question.sourceAnchor
    ? (lessonHeadingsOf(lesson.contentType, lesson.contentJson).find((h) => h.id === question.sourceAnchor) ?? null)
    : null;

  return {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    anchor: heading?.id ?? null,
    heading: heading?.text ?? null,
    excerpt: question.sourceExcerpt?.trim() || null,
  };
}

export type ReviewItem = {
  questionId: string;
  /** Null when the question records no source, or the source may not be shown. */
  source: ReviewSource | null;
};

/**
 * The review list for a failed attempt: one entry per question that was not
 * fully correct, in quiz order.
 *
 * It names WHICH questions were wrong and never how — not the correct option,
 * not which of the chosen options were mistakes.
 */
export function buildReview(
  questions: readonly ({ id: string } & QuestionSource)[],
  perQuestion: Readonly<Record<string, boolean>>,
  course: ReviewCourse | null
): ReviewItem[] {
  return questions
    .filter((q) => perQuestion[q.id] === false)
    .map((q) => ({ questionId: q.id, source: resolveReviewSource(q, course) }));
}
