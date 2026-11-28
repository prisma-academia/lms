import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { logger } from "@/lib/logger";
import { gradeExamAttempt } from "@/lib/exams/grading";
import { onAttemptFinished } from "@/lib/exams/outcomes";
import { examOr404, FINISHED_STATUSES } from "@/lib/exams/ops";

export const maxDuration = 300;

/**
 * Re-score every finished attempt from the stored answers, the CURRENT answer
 * keys and any marks already given (after fixing a wrong key, say). No AI
 * calls: essay suggestions already made are kept.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_GRADE.key);
    const { id } = await ctx.params;
    await examOr404(id, actor.tenantId);
    const attempts = await prisma.examAttempt.findMany({
      where: { examId: id, tenantId: actor.tenantId, status: { in: [...FINISHED_STATUSES] } },
      select: { id: true },
    });
    let graded = 0;
    let pending = 0;
    let failed = 0;
    for (const a of attempts) {
      try {
        const outcome = await gradeExamAttempt(a.id);
        await onAttemptFinished(a.id);
        if (outcome.pending > 0) pending++;
        else graded++;
      } catch (e) {
        failed++;
        logger.error({ err: String(e), attemptId: a.id }, "exam_regrade_failed");
      }
    }
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "exam.results.regraded",
      tenantId: actor.tenantId,
      targetType: "Exam",
      targetId: id,
      after: { attempts: attempts.length, graded, pending, failed },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ attempts: attempts.length, graded, pending, failed });
  } catch (e) {
    return handleError(e);
  }
}
