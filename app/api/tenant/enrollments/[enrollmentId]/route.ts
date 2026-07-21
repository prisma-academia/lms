import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const PatchBody = z.object({
  action: z.literal("reset-progress"),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ enrollmentId: string }> }
) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_ENROLLMENTS_WRITE.key);
    const { enrollmentId } = await ctx.params;
    PatchBody.parse(await request.json());

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, tenantId: actor.tenantId },
    });
    if (!enrollment) throw new DomainError(404, "not_found", "Enrollment not found.");

    const [, updated] = await prisma.$transaction([
      prisma.lessonProgress.deleteMany({ where: { enrollmentId } }),
      prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { progressPercent: 0, completedAt: null },
      }),
    ]);
    return ok({ enrollment: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ enrollmentId: string }> }
) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_ENROLLMENTS_WRITE.key);
    const { enrollmentId } = await ctx.params;

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, tenantId: actor.tenantId },
    });
    if (!enrollment) throw new DomainError(404, "not_found", "Enrollment not found.");

    // Deleting the enrollment cascades its LessonProgress rows.
    await prisma.enrollment.delete({ where: { id: enrollmentId } });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
