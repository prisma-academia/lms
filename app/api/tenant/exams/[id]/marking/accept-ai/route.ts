import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { gradeExamAttempt } from "@/lib/exams/grading";
import { onAttemptFinished } from "@/lib/exams/outcomes";
import { examOr404, FINISHED_STATUSES } from "@/lib/exams/ops";
import { clampMark } from "@/lib/exams/marking";
import { parseAiSuggestion } from "@/lib/exams/review";

export const maxDuration = 120;

const Body = z.object({ responseIds: z.array(z.string().min(1)).min(1).max(2000).optional() });

/**
 * Confirm the AI's suggested marks as the real ones: for the answers named,
 * or for every unmarked answer that has a suggestion. Each accepted mark is
 * recorded against the member of staff who accepted it.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_GRADE.key);
    const { id } = await ctx.params;
    const body = Body.parse(await request.json().catch(() => ({})));
    await examOr404(id, actor.tenantId);
    const rows = await prisma.examResponse.findMany({
      where: {
        tenantId: actor.tenantId,
        attempt: { examId: id, status: { in: [...FINISHED_STATUSES] } },
        ...(body.responseIds ? { id: { in: body.responseIds } } : { manualPoints: null }),
      },
      select: { id: true, attemptId: true, maxPoints: true, aiSuggestionJson: true, feedback: true },
    });
    const now = new Date();
    const accepted: { id: string; attemptId: string; points: number }[] = [];
    for (const r of rows) {
      const s = parseAiSuggestion(r.aiSuggestionJson);
      if (!s || r.maxPoints == null) continue;
      const points = clampMark(s.points, r.maxPoints);
      await prisma.examResponse.update({
        where: { id: r.id },
        data: { manualPoints: points, feedback: r.feedback ?? (s.feedback || null), markedById: actor.userId, markedAt: now },
      });
      accepted.push({ id: r.id, attemptId: r.attemptId, points });
    }
    const attempts = [...new Set(accepted.map((a) => a.attemptId))];
    for (const attemptId of attempts) {
      await gradeExamAttempt(attemptId);
      await onAttemptFinished(attemptId);
    }
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "exam.response.ai_accepted",
      tenantId: actor.tenantId,
      targetType: "Exam",
      targetId: id,
      after: { accepted: accepted.length, attempts: attempts.length, responseIds: accepted.map((a) => a.id).slice(0, 500) },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ accepted: accepted.length, attempts: attempts.length });
  } catch (e) {
    return handleError(e);
  }
}
