import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { DomainError } from "@/lib/api/errors";

/** GET /api/v1/enrollments/{id}/progress — per-lesson started / completed times. */
export const GET = apiRoute<{ id: string }>({ scope: "enrollments:read" }, async (ctx) => {
  const e = await prisma.enrollment.findFirst({ where: { id: ctx.params.id, tenantId: ctx.tenantId } });
  if (!e) throw new DomainError(404, "not_found", "Enrollment not found.");
  const [lessons, progress] = await Promise.all([
    prisma.lesson.findMany({
      where: { tenantId: ctx.tenantId, courseId: e.courseId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true },
    }),
    prisma.lessonProgress.findMany({
      where: { tenantId: ctx.tenantId, enrollmentId: e.id },
      select: { lessonId: true, startedAt: true, completedAt: true },
    }),
  ]);
  const byLesson = new Map(progress.map((p) => [p.lessonId, p]));
  return {
    data: {
      enrollmentId: e.id,
      progressPercent: e.progressPercent,
      completedAt: e.completedAt?.toISOString() ?? null,
      totalLessons: lessons.length,
      lessons: lessons.map((l) => {
        const p = byLesson.get(l.id);
        return { lessonId: l.id, title: l.title, startedAt: p?.startedAt?.toISOString() ?? null, completedAt: p?.completedAt?.toISOString() ?? null };
      }),
    },
  };
});
