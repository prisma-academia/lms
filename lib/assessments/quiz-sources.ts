import { prisma } from "@/lib/db/client";
import { lessonHeadingsOf, sectionHeadings } from "@/lib/content/lesson-headings";

/**
 * The lessons and headings a quiz's questions can point at for "read up".
 *
 * A question's source only ever resolves for a learner when the lesson is in
 * the same course as the quiz, so that is exactly what is offered: the reading
 * lessons of each course this quiz is attached to, with the headings that head
 * a section of each. A quiz attached to no course yields an empty list, and the
 * builder says so rather than offering sources that could never be shown.
 */
export type QuizSourceCourse = {
  id: string;
  title: string;
  lessons: {
    id: string;
    title: string;
    headings: { id: string; text: string; level: number }[];
  }[];
};

export async function loadQuizSources(tenantId: string, quizId: string): Promise<QuizSourceCourse[]> {
  const quizLessons = await prisma.lesson.findMany({
    where: {
      tenantId,
      contentType: "QUIZ",
      contentJson: { path: ["quizId"], equals: quizId },
    },
    select: { courseId: true },
  });
  const courseIds = [...new Set(quizLessons.map((l) => l.courseId))];
  if (courseIds.length === 0) return [];

  const courses = await prisma.course.findMany({
    where: { id: { in: courseIds }, tenantId },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      lessons: {
        where: { contentType: { in: ["TEXT", "HTML"] } },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, title: true, contentType: true, contentJson: true },
      },
    },
  });

  return courses.map((course) => ({
    id: course.id,
    title: course.title,
    lessons: course.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      headings: sectionHeadings(lessonHeadingsOf(lesson.contentType, lesson.contentJson)).map((h) => ({
        id: h.id,
        text: h.text,
        level: h.level,
      })),
    })),
  }));
}
