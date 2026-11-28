import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { audit } from "@/lib/auth/audit";
import { DomainError } from "@/lib/api/errors";
import { ReleaseResults } from "@/lib/api/v1/schemas";
import { releaseResults } from "@/lib/exams/outcomes";

/**
 * POST /api/v1/exams/{id}/release-results — release every finished, fully
 * marked attempt (or just `attemptIds`). Attempts still awaiting a mark are
 * left alone. Returns how many were released.
 */
export const POST = apiRoute<{ id: string }>({ scope: "exams:write" }, async (ctx) => {
  const body = ctx.json(ReleaseResults);
  const exam = await prisma.exam.findFirst({ where: { id: ctx.params.id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
  if (body.attemptIds?.length) {
    const owned = await prisma.examAttempt.count({ where: { tenantId: ctx.tenantId, examId: exam.id, id: { in: body.attemptIds } } });
    if (owned !== new Set(body.attemptIds).size) throw new DomainError(400, "invalid_attempt", "An attempt does not belong to this exam.");
  }
  const released = await releaseResults(exam.id, body.attemptIds?.length ? { attemptIds: body.attemptIds } : {});
  await audit({ ...ctx.auditActor, action: "exam.results_release", targetType: "Exam", targetId: exam.id, after: { released } });
  return { data: { released } };
});
