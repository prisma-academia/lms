import { prisma } from "@/lib/db/client";
import { isUnlocked } from "@/lib/courses/gating";
import type { ReviewCourse } from "@/lib/assessments/review-links";

/**
 * The course a learner is taking a quiz through.
 *
 * A learner may attempt a quiz only through a QUIZ lesson that is both in a
 * course they are enrolled in AND currently unlocked for them. The enrolment
 * check alone is not enough: without the unlock check, a quiz id lifted from an
 * earlier course (or guessed) would hand over the questions for a lesson the
 * learner has not reached — a side door around the gate in
 * app/api/client/courses/[slug]/learn/route.ts.
 *
 * Returns null when there is no such course. When there is one it also returns
 * that course's lessons and the learner's completed set, which is exactly what
 * essay grading needs for context and what "read up" links need to decide which
 * lessons the learner may be sent to.
 */
export type QuizCourse = ReviewCourse & {
  courseId: string;
  /** The QUIZ lesson the quiz was reached through. */
  quizLessonId: string;
};

export async function findQuizCourse(clientId: string, quizId: string): Promise<QuizCourse | null> {
  const enrollments = await prisma.enrollment.findMany({
    where: { clientId },
    select: {
      id: true,
      courseId: true,
      lessonProgress: {
        where: { completedAt: { not: null } },
        select: { lessonId: true },
      },
    },
  });
  if (enrollments.length === 0) return null;

  const lessons = await prisma.lesson.findMany({
    where: { courseId: { in: enrollments.map((e) => e.courseId) } },
    // Course order. The id tiebreak matters — see `orderLessons` in gating.ts.
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, courseId: true, title: true, sortOrder: true, contentType: true, contentJson: true },
  });

  const byCourse = new Map<string, typeof lessons>();
  for (const lesson of lessons) {
    const list = byCourse.get(lesson.courseId) ?? [];
    list.push(lesson);
    byCourse.set(lesson.courseId, list);
  }

  for (const enrollment of enrollments) {
    const courseLessons = byCourse.get(enrollment.courseId) ?? [];
    const linked = courseLessons.find(
      (l) =>
        l.contentType === "QUIZ" &&
        (l.contentJson as { quizId?: unknown } | null)?.quizId === quizId
    );
    if (!linked) continue;

    const completed = new Set(enrollment.lessonProgress.map((p) => p.lessonId));
    // Reachable through any one enrolled course is enough.
    if (isUnlocked(courseLessons, completed, linked.id)) {
      return { courseId: enrollment.courseId, quizLessonId: linked.id, lessons: courseLessons, completed };
    }
  }

  return null;
}
