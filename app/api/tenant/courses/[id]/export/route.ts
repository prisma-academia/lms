import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { handleError, DomainError } from "@/lib/api/errors";
import {
  courseTemplateSchema,
  type CourseTemplate,
  type GeneratedLesson,
  type GeneratedQuiz,
} from "@/lib/schemas/course-builder";

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asNumberArray(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_READ.key);
    const { id: courseId } = await ctx.params;

    const course = await prisma.course.findFirst({
      where: { id: courseId, tenantId: actor.tenantId },
      include: {
        lessons: { orderBy: { sortOrder: "asc" } },
        lessonGroups: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");
    if (course.lessons.length === 0)
      throw new DomainError(400, "empty_course", "This course has no lessons to export.");

    // Embed full quiz definitions for QUIZ lessons.
    const quizIds = course.lessons
      .map((l) => (l.contentType === "QUIZ" ? (l.contentJson as Record<string, unknown>).quizId : null))
      .filter((id): id is string => typeof id === "string");
    const quizzes = quizIds.length
      ? await prisma.quiz.findMany({
          where: { id: { in: quizIds }, tenantId: actor.tenantId },
          include: { questions: { orderBy: { sortOrder: "asc" }, include: { question: true } } },
        })
      : [];
    const quizById = new Map(quizzes.map((q) => [q.id, q]));

    function exportLesson(lesson: (typeof course & object)["lessons"][number]): GeneratedLesson {
      const json = lesson.contentJson as Record<string, unknown>;
      let quiz: GeneratedQuiz | null = null;
      if (lesson.contentType === "QUIZ") {
        const q = typeof json.quizId === "string" ? quizById.get(json.quizId) : undefined;
        if (q && q.questions.length > 0) {
          quiz = {
            title: q.title,
            description: q.description,
            passingScore: q.passingScore,
            questions: q.questions.slice(0, 20).map((link) => {
              const question = link.question;
              const isChoice = question.type !== "SHORT_ANSWER";
              return {
                type: question.type,
                prompt: question.prompt,
                options: isChoice ? asStringArray(question.optionsJson) : [],
                correctOptionIndexes: isChoice ? asNumberArray(question.answerJson) : [],
                acceptedAnswers: isChoice ? [] : asStringArray(question.answerJson),
                points: link.points ?? question.points,
              };
            }),
          };
        }
      }
      const placeholderNote =
        lesson.contentType === "VIDEO_URL"
          ? typeof json.url === "string" && json.url
            ? `Original video URL: ${json.url}`
            : "Attach a video."
          : lesson.contentType === "FILE"
            ? lesson.assetKey
              ? `Original file asset: ${lesson.assetKey}`
              : "Attach a file."
            : null;
      return {
        title: lesson.title,
        contentType: quiz || lesson.contentType !== "QUIZ" ? lesson.contentType : "TEXT",
        body: typeof json.body === "string" ? json.body : null,
        html: typeof json.html === "string" ? json.html : null,
        quiz,
        durationMin: lesson.durationMin,
        placeholderNote,
      };
    }

    // Group lessons; ungrouped ones fall into a synthetic trailing group.
    const groups = course.lessonGroups
      .map((g) => ({
        title: g.title,
        lessons: course.lessons.filter((l) => l.groupId === g.id).map(exportLesson),
      }))
      .filter((g) => g.lessons.length > 0);
    const ungrouped = course.lessons.filter((l) => !l.groupId).map(exportLesson);
    if (ungrouped.length > 0) groups.push({ title: "Lessons", lessons: ungrouped });

    const template: CourseTemplate = courseTemplateSchema.parse({
      format: "lms-course",
      version: 1,
      course: {
        title: course.title,
        slug: course.slug,
        description: course.description,
        priceCents: course.priceCents,
        currency: course.currency,
      },
      courseSummary: course.description,
      groups: groups.slice(0, 15),
    });

    return new Response(JSON.stringify(template, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${course.slug}.course.json"`,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
