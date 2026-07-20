import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { courseBuilderInputSchema } from "@/lib/schemas/course-builder";

// Course generation calls an LLM per module and can take a couple of minutes.
export const maxDuration = 300;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id: courseId } = await ctx.params;
    const body = courseBuilderInputSchema.parse(await request.json());

    const course = await prisma.course.findFirst({ where: { id: courseId, tenantId: actor.tenantId } });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    // Lazy import keeps the Mastra instance (top-level await, native storage deps)
    // out of the module graph until the builder is actually used.
    const { mastra } = await import("@/src/mastra");
    const workflow = mastra.getWorkflow("courseBuilderWorkflow");
    const run = await workflow.createRun();
    const result = await run.start({ inputData: body });

    if (result.status !== "success") {
      const detail =
        result.status === "failed" && result.error instanceof Error
          ? result.error.message
          : `Workflow ended with status "${result.status}".`;
      throw new DomainError(502, "generation_failed", `Course generation failed: ${detail}`);
    }

    return ok({ course: result.result.course });
  } catch (e) {
    return handleError(e);
  }
}
