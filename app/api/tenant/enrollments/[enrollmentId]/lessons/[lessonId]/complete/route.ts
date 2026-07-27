import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { recordLessonCompletion } from "@/lib/courses/complete-lesson";
import { audit, requestMeta } from "@/lib/auth/audit";

/**
 * Staff override: mark a lesson complete for a learner, past every gate.
 *
 * Every gating system needs one of these. Without it, a single bad day from the
 * essay grader — or a lesson whose quiz was misconfigured after learners had
 * already reached it — becomes a support ticket nobody can resolve, because the
 * learner is blocked behind a 100% bar they cannot clear.
 *
 * It reuses `recordLessonCompletion`, the same write path as the learner route,
 * so progressPercent and certificate issuance can never drift between the two.
 * The gates simply aren't run here — that's the whole point — which is why this
 * is permissioned and written to the audit log.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ enrollmentId: string; lessonId: string }> }
) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { enrollmentId, lessonId } = await ctx.params;

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, tenantId: actor.tenantId },
      select: {
        id: true,
        completedAt: true,
        courseId: true,
        clientId: true,
        course: { select: { id: true, title: true, _count: { select: { lessons: true } } } },
      },
    });
    if (!enrollment) throw new DomainError(404, "not_found", "Enrollment not found.");

    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, courseId: enrollment.courseId, tenantId: actor.tenantId },
      select: { id: true, title: true },
    });
    if (!lesson) {
      throw new DomainError(404, "not_found", "Lesson not found in this learner's course.");
    }

    const updated = await recordLessonCompletion({
      tenantId: actor.tenantId,
      clientId: enrollment.clientId,
      courseId: enrollment.courseId,
      enrollment: { id: enrollment.id, completedAt: enrollment.completedAt },
      lessonId,
      totalLessons: enrollment.course._count.lessons,
    });

    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "lesson.complete.override",
      tenantId: actor.tenantId,
      targetType: "Enrollment",
      targetId: enrollment.id,
      after: {
        lessonId,
        lessonTitle: lesson.title,
        courseTitle: enrollment.course.title,
        clientId: enrollment.clientId,
        progressPercent: updated.progressPercent,
      },
      ...requestMeta(request),
    });

    return ok({ enrollment: updated });
  } catch (e) {
    return handleError(e);
  }
}
