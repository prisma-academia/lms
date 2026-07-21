import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import {
  generatedLessonSchema,
  lessonGenerateInputSchema,
} from "@/lib/schemas/course-builder";

// One LLM call — much faster than full course generation, but still minutes-scale worst case.
export const maxDuration = 120;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; lessonId: string }> }
) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id: courseId, lessonId } = await ctx.params;
    const body = lessonGenerateInputSchema.parse(await request.json());

    const course = await prisma.course.findFirst({
      where: { id: courseId, tenantId: actor.tenantId },
      include: {
        lessons: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true, contentType: true, groupId: true, durationMin: true } },
        lessonGroups: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true } },
      },
    });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    const lesson = course.lessons.find((l) => l.id === lessonId);
    if (!lesson) throw new DomainError(404, "not_found", "Lesson not found.");
    if (lesson.contentType !== "TEXT" && lesson.contentType !== "HTML") {
      throw new DomainError(
        400,
        "unsupported_content_type",
        "AI generation is only available for text and HTML lessons."
      );
    }

    // Course outline for context, mirroring the builder workflow's outlineSummary.
    const groupTitle = (groupId: string | null) =>
      groupId ? course.lessonGroups.find((g) => g.id === groupId)?.title ?? null : null;
    const outline = [
      ...course.lessonGroups.map(
        (g) =>
          `${g.title}\n${course.lessons
            .filter((l) => l.groupId === g.id)
            .map((l) => `  - [${l.contentType}] ${l.title}`)
            .join("\n")}`
      ),
      ...course.lessons
        .filter((l) => !l.groupId)
        .map((l) => `- [${l.contentType}] ${l.title}`),
    ].join("\n");

    const prompt = `Write the full content for ONE lesson of an existing course.

Course: ${course.title}${course.description ? `\nCourse description: ${course.description}` : ""}

Course outline (for context — write content ONLY for the lesson below):
${outline}

Lesson to write: "${lesson.title}"${groupTitle(lesson.groupId) ? ` (module: "${groupTitle(lesson.groupId)}")` : ""}
Content type: ${lesson.contentType}${lesson.durationMin ? `\nTarget duration: ~${lesson.durationMin} min` : ""}
${body.instructions ? `\nInstructions from the course admin:\n${body.instructions}` : ""}

Keep the exact lesson title and contentType. Fill in body (TEXT) or html (HTML) as appropriate.
Do not generate a quiz or placeholders.`;

    // Lazy import keeps the Mastra instance (top-level await, native storage deps)
    // out of the module graph until AI generation is actually used.
    const { mastra } = await import("@/src/mastra");
    const agent = mastra.getAgent("courseBuilderAgent");
    const result = await agent.generate([{ role: "user", content: prompt }], {
      structuredOutput: { schema: generatedLessonSchema, errorStrategy: "strict" },
    });
    if (!result.object) {
      throw new DomainError(502, "generation_failed", "Lesson generation returned no content.");
    }

    return ok({ lesson: generatedLessonSchema.parse(result.object) });
  } catch (e) {
    return handleError(e);
  }
}
