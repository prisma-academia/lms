import { prisma } from "@/lib/db/client";
import { lessonPlainText } from "@/lib/courses/lesson-text";

/** Roughly 3k tokens of context — enough to ground grading, cheap enough to send every time. */
const MAX_CONTEXT_CHARS = 12_000;

/**
 * The teaching material a quiz is testing, as plain text for the essay grader.
 *
 * A QUIZ lesson's own `contentJson` is just `{ quizId }`, so the material has to
 * come from the lessons around it. Scoped to the quiz's own LessonGroup
 * (module) rather than the whole course: the course-builder agent is already
 * instructed to "end most modules with a QUIZ lesson that checks that module's
 * material", so the module boundary is where the relevant content actually is,
 * and a whole-course dump would bury it.
 *
 * Returns "" when there is nothing to send — the grader then falls back to the
 * rubric and model answer alone, which is degraded but still correct.
 */
export async function buildQuizContext(
  quizId: string,
  /**
   * The course the learner is taking the quiz through, when known. A quiz
   * reused in two courses is testing each course's own material, so without
   * this the context could come from the wrong one.
   */
  opts: { courseId?: string } = {}
): Promise<string> {
  // Ask the database for the lesson that links this quiz. This used to load
  // every QUIZ lesson the caller could see and search them in memory — a scan
  // that grew with the tenant, on a request a learner is waiting on.
  const quizLesson = await prisma.lesson.findFirst({
    where: {
      contentType: "QUIZ",
      contentJson: { path: ["quizId"], equals: quizId },
      ...(opts.courseId ? { courseId: opts.courseId } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, courseId: true, groupId: true, sortOrder: true },
  });
  if (!quizLesson) return "";

  const siblings = await prisma.lesson.findMany({
    where: {
      courseId: quizLesson.courseId,
      contentType: { in: ["TEXT", "HTML"] },
      // Same module when the quiz has one; otherwise fall back to the whole course
      // and let the "lessons before this one" filter below do the narrowing.
      ...(quizLesson.groupId ? { groupId: quizLesson.groupId } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { title: true, contentJson: true, sortOrder: true },
  });

  const before = siblings.filter((l) => l.sortOrder < quizLesson.sortOrder);
  const source = before.length > 0 ? before : siblings;

  const parts: string[] = [];
  let length = 0;
  for (const lesson of source) {
    const text = lessonPlainText(lesson.contentJson);
    if (!text) continue;
    const block = `## ${lesson.title}\n${text}`;
    if (length + block.length > MAX_CONTEXT_CHARS) {
      // Truncate the tail rather than dropping the block: a partial final lesson
      // is more useful to the grader than none of it.
      const room = MAX_CONTEXT_CHARS - length;
      if (room > 200) parts.push(`${block.slice(0, room)}…`);
      break;
    }
    parts.push(block);
    length += block.length;
  }

  return parts.join("\n\n");
}
