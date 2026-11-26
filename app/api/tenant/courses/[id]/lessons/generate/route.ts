import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import {
  generatedLessonSchema,
  lessonGenerateInputSchema,
} from "@/lib/schemas/course-builder";
import { aiDomainError, requireAiConfigured } from "@/lib/ai/http";
import { writeLesson } from "@/lib/ai/lesson-writer";

// One LLM call — much faster than full course generation, but still minutes-scale worst case.
export const maxDuration = 120;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id: courseId } = await ctx.params;
    const body = lessonGenerateInputSchema.parse(await request.json());

    const course = await prisma.course.findFirst({
      where: { id: courseId, tenantId: actor.tenantId },
      include: {
        lessons: {
          orderBy: { sortOrder: "asc" },
          select: { title: true, contentType: true, groupId: true },
        },
        lessonGroups: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true } },
      },
    });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    // Course outline for context, mirroring the builder workflow's outlineSummary.
    const outline = [
      ...course.lessonGroups.map(
        (g) =>
          `${g.title}\n${course.lessons
            .filter((l) => l.groupId === g.id)
            .map((l) => `  - [${l.contentType}] ${l.title}`)
            .join("\n")}`
      ),
      ...course.lessons.filter((l) => !l.groupId).map((l) => `- [${l.contentType}] ${l.title}`),
    ]
      .filter(Boolean)
      .join("\n");

    requireAiConfigured();

    // Lazy import keeps the Mastra instance (top-level await, native storage deps)
    // out of the module graph until AI generation is actually used.
    const { getMastra } = await import("@/src/mastra");
    const mastra = await getMastra();
    const agent = mastra.getAgent("courseBuilderAgent");

    let written;
    try {
      written = await writeLesson(agent, {
        courseContext: `Course: ${course.title}${
          course.description ? `\nCourse description: ${course.description}` : ""
        }${
          outline
            ? `\n\nCourse outline (for context — write content ONLY for the one lesson named below):\n${outline}`
            : ""
        }`,
        title: body.title,
        contentType: body.contentType,
        instructions: body.instructions,
      });
    } catch (e) {
      throw aiDomainError(e, "lesson_generate_new");
    }

    return ok({
      lesson: generatedLessonSchema.parse({
        title: body.title,
        contentType: body.contentType,
        body: written.body,
        html: written.html,
      }),
    });
  } catch (e) {
    return handleError(e);
  }
}
