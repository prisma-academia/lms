import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { gradeExamAttempt } from "@/lib/exams/grading";
import { onAttemptFinished } from "@/lib/exams/outcomes";
import { markableResponse } from "@/lib/exams/marking";

const Body = z.object({
  points: z.number().min(0).max(10_000),
  feedback: z.string().trim().max(3000).optional(),
});

/** A marker's mark for one answer. Re-scores the attempt straight away. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; responseId: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_GRADE.key);
    const { id, responseId } = await ctx.params;
    const body = Body.parse(await request.json());
    const r = await markableResponse(id, responseId, actor.tenantId);
    if (body.points > r.max) throw new DomainError(400, "validation_error", `The mark can be at most ${r.max}.`);
    if (Math.abs(body.points * 2 - Math.round(body.points * 2)) > 1e-9) {
      throw new DomainError(400, "validation_error", "Marks go in steps of 0.5.");
    }
    await prisma.examResponse.update({
      where: { id: r.id },
      data: {
        manualPoints: body.points,
        feedback: body.feedback ? body.feedback : null,
        markedById: actor.userId,
        markedAt: new Date(),
      },
    });
    const outcome = await gradeExamAttempt(r.attemptId);
    await onAttemptFinished(r.attemptId);
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "exam.response.marked",
      tenantId: actor.tenantId,
      targetType: "ExamResponse",
      targetId: r.id,
      before: { manualPoints: r.manualPoints, feedback: r.feedback },
      after: {
        examId: id,
        attemptId: r.attemptId,
        manualPoints: body.points,
        max: r.max,
        scorePercent: outcome.scorePercent,
        pending: outcome.pending,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ responseId: r.id, points: body.points, attempt: outcome });
  } catch (e) {
    return handleError(e);
  }
}
