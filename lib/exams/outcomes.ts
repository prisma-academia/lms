import { prisma } from "@/lib/db/client";
import { awardCertificate } from "@/lib/certificates/award";
import { recordLessonCompletion } from "@/lib/courses/complete-lesson";
import { logger } from "@/lib/logger";

/**
 * What a released exam result does to the rest of the academy: completes the
 * course's EXAM lesson on a pass, issues the exam's certificate, and tells the
 * learner. Idempotent — running it twice for the same attempt changes nothing.
 *
 * Nothing happens until the result is final (no marks pending) AND released;
 * an unreleased pass must not leak through a lesson suddenly unlocking.
 */
export async function onAttemptFinished(attemptId: string): Promise<void> {
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId },
    include: { exam: true, candidate: true },
  });
  if (!attempt) return;
  if (attempt.gradingStatus !== "GRADED" || !attempt.releasedAt) return;
  // Webhook, once per attempt (this function runs again on every re-check). Never throws.
  await import("@/lib/integrations/events").then(({ emitEvent }) => emitEvent(attempt.tenantId, "exam.result.released", { attemptId: attempt.id, examId: attempt.examId, candidateId: attempt.candidateId, candidateNo: attempt.candidate.candidateNo, learnerId: attempt.candidate.clientId, scorePercent: attempt.scorePercent, passed: attempt.passed, grade: attempt.grade, releasedAt: attempt.releasedAt!.toISOString() }, { learnerId: attempt.candidate.clientId, oncePer: "attemptId" })).catch(() => undefined);
  const clientId = attempt.candidate.clientId;
  if (!clientId) return;
  const { exam } = attempt;

  if (attempt.passed) {
    // Course lessons that embed this exam.
    const lessons = await prisma.lesson.findMany({
      where: { contentType: "EXAM", contentJson: { path: ["examId"], equals: exam.id } },
      select: { id: true, courseId: true },
    });
    for (const lesson of lessons) {
      const enrollment = await prisma.enrollment.findFirst({
        where: { clientId, courseId: lesson.courseId },
        select: { id: true, completedAt: true },
      });
      if (!enrollment) continue;
      const totalLessons = await prisma.lesson.count({ where: { courseId: lesson.courseId } });
      await recordLessonCompletion({
        tenantId: attempt.tenantId,
        clientId,
        courseId: lesson.courseId,
        enrollment,
        lessonId: lesson.id,
        totalLessons,
      }).catch((e) => logger.error({ err: String(e), attemptId }, "exam_lesson_completion_failed"));
    }
    if (exam.certificateId) {
      await awardCertificate(attempt.tenantId, exam.certificateId, clientId, { courseId: exam.courseId }).catch((e) =>
        logger.error({ err: String(e), attemptId }, "exam_certificate_failed")
      );
    }
  }

  // One notification per attempt: the title carries the attempt id marker.
  const marker = `exam-result:${attempt.id}`;
  const already = await prisma.notification.findFirst({ where: { clientId, body: { contains: marker } }, select: { id: true } });
  if (!already) {
    await prisma.notification.create({
      data: {
        tenantId: attempt.tenantId,
        clientId,
        category: "ANNOUNCEMENT",
        title: `Your result for “${exam.title}” is ready`,
        body: `Open My Exams to see it. [${marker}]`,
      },
    });
  }
}

/** Release results for every finished, fully marked attempt of an exam. */
export async function releaseResults(examId: string, opts: { attemptIds?: string[] } = {}): Promise<number> {
  const now = new Date();
  const targets = await prisma.examAttempt.findMany({
    where: {
      examId,
      status: { in: ["SUBMITTED", "TERMINATED"] },
      gradingStatus: "GRADED",
      releasedAt: null,
      ...(opts.attemptIds ? { id: { in: opts.attemptIds } } : {}),
    },
    select: { id: true },
  });
  if (targets.length === 0) return 0;
  await prisma.examAttempt.updateMany({ where: { id: { in: targets.map((t) => t.id) } }, data: { releasedAt: now } });
  for (const t of targets) await onAttemptFinished(t.id);
  return targets.length;
}
