import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { applyGeneratedCourse } from "@/lib/courses/apply-generated-course";
import { generatedCourseSchema } from "@/lib/schemas/course-builder";

const Body = z.object({
  course: generatedCourseSchema,
  /**
   * Echoed back from the generation request. Defaults false, so an import that
   * never opted into essays can't apply an AI-authored rubric — which would be
   * a permanent progression gate nobody reviewed.
   */
  allowEssays: z.boolean().default(false),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id: courseId } = await ctx.params;
    const { course: generated, allowEssays } = Body.parse(await request.json());

    const course = await prisma.course.findFirst({ where: { id: courseId, tenantId: actor.tenantId } });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    const created = await applyGeneratedCourse({
      tenantId: actor.tenantId,
      courseId,
      courseTitle: course.title,
      generated,
      allowEssays,
    });

    return ok({ created }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
