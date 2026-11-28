import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { applyProctorAction } from "@/lib/exams/proctor";
import { attemptOfExam, proctorActionSchema, toProctorAction } from "@/lib/exams/ops";

/** One invigilator action on one live attempt. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; attemptId: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_PROCTOR.key);
    const { id, attemptId } = await ctx.params;
    const body = proctorActionSchema.parse(await request.json());
    const before = await attemptOfExam(id, attemptId, actor.tenantId);
    await applyProctorAction(attemptId, toProctorAction(body), actor.userId);
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: `exam.proctor.${body.action}`,
      tenantId: actor.tenantId,
      targetType: "ExamAttempt",
      targetId: attemptId,
      before: { status: before.status, deadlineAt: before.deadlineAt.toISOString() },
      after: { examId: id, ...(body.minutes ? { minutes: body.minutes } : {}), ...(body.note ? { note: body.note } : {}) },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ attemptId, action: body.action });
  } catch (e) {
    return handleError(e);
  }
}
