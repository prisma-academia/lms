import { prisma } from "@/lib/db/client";
import { awardCourseCompletion } from "@/lib/certificates/award";

/**
 * The single write path for "this lesson is done".
 *
 * Deliberately gate-free: every gate (order, dwell, media, quiz) lives in the
 * caller. That is what lets an instructor override reuse this function verbatim
 * instead of duplicating the progress recount and the certificate award — the
 * two things that must never drift between the learner path and the staff path.
 */
export async function recordLessonCompletion(params: {
  tenantId: string;
  clientId: string;
  courseId: string;
  enrollment: { id: string; completedAt: Date | null };
  lessonId: string;
  totalLessons: number;
}): Promise<{ progressPercent: number; completedAt: Date | null }> {
  const { tenantId, clientId, courseId, enrollment, lessonId, totalLessons } = params;
  const now = new Date();

  const existing = await prisma.lessonProgress.findUnique({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    select: { completedAt: true },
  });

  await prisma.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    create: { enrollmentId: enrollment.id, lessonId, tenantId, startedAt: now, completedAt: now },
    // Keep the ORIGINAL completion date: re-completing must not rewrite history,
    // or the dashboard streak silently reports today for a lesson finished weeks ago.
    update: { completedAt: existing?.completedAt ?? now },
  });

  // Row presence means "opened" now, so this MUST filter on completedAt.
  // Without the filter, opening lessons alone drives progress to 100%.
  const completedCount = await prisma.lessonProgress.count({
    where: { enrollmentId: enrollment.id, completedAt: { not: null } },
  });

  const progressPercent = totalLessons === 0 ? 0 : Math.round((completedCount / totalLessons) * 100);
  const courseDone = progressPercent >= 100;

  const updated = await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      progressPercent,
      completedAt: courseDone ? (enrollment.completedAt ?? now) : enrollment.completedAt,
    },
    select: { progressPercent: true, completedAt: true },
  });

  if (courseDone) {
    await awardCourseCompletion(tenantId, courseId, clientId);
  }

  return updated;
}

/**
 * Mark a lesson as opened, starting the dwell clock.
 *
 * `update: {}` is load-bearing: reopening a lesson must neither restart the
 * clock (navigating away and back would be a free reset) nor clear a completion.
 */
export async function recordLessonOpen(params: {
  tenantId: string;
  enrollmentId: string;
  lessonId: string;
}): Promise<{ startedAt: Date | null }> {
  const { tenantId, enrollmentId, lessonId } = params;
  const row = await prisma.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    create: { enrollmentId, lessonId, tenantId, startedAt: new Date(), completedAt: null },
    update: {},
    select: { startedAt: true },
  });
  return row;
}
