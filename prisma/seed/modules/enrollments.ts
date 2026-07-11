import { DAY, type SeedContext } from "../index";
import { enrolledCourses, lessonCount } from "../components/catalogs/courses";
import { completionDates, progressPercent } from "../components/factories/progress";

export async function seedEnrollments(ctx: SeedContext): Promise<void> {
  const { prisma, tenantId, now } = ctx;
  const clientId = ctx.ids.clientId;

  for (const c of enrolledCourses()) {
    const ref = ctx.ids.courseBySlug[c.slug];
    if (!ref) continue;

    const total = lessonCount(c);
    const doneCount = Math.min(c.completedLessons, total);
    const pct = progressPercent(doneCount, total);
    const isComplete = c.completed === true || doneCount >= total;

    const enrollment = await prisma.enrollment.create({
      data: {
        tenantId,
        courseId: ref.courseId,
        clientId,
        progressPercent: pct,
        completedAt: isComplete ? new Date(now - 5 * DAY) : null,
      },
    });

    const dates = completionDates(now, doneCount);
    for (let i = 0; i < doneCount; i++) {
      await prisma.lessonProgress.create({
        data: {
          tenantId,
          enrollmentId: enrollment.id,
          lessonId: ref.lessonIds[i],
          completedAt: dates[i],
        },
      });
    }
  }
}
