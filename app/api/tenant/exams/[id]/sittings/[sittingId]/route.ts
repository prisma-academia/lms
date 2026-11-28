import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { DomainError, handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { assertCidrs, auditExam, findExam, LIVE_ATTEMPT_STATUSES, sittingWriteSchema } from "@/lib/exams/admin";

type Ctx = { params: Promise<{ id: string; sittingId: string }> };

async function findSitting(examId: string, sittingId: string) {
  const s = await prisma.examSitting.findFirst({ where: { id: sittingId, examId } });
  if (!s) throw new DomainError(404, "not_found", "Sitting not found.");
  return s;
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id, sittingId } = await ctx.params;
    const body = sittingWriteSchema.partial().parse(await request.json());
    await findExam(actor.tenantId, id);
    const before = await findSitting(id, sittingId);
    const ipAllowlist = assertCidrs(body.ipAllowlist);
    const startsAt = body.startsAt !== undefined ? body.startsAt : before.startsAt;
    const endsAt = body.endsAt !== undefined ? body.endsAt : before.endsAt;
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new DomainError(400, "invalid_window", "The sitting must end after it starts.");
    }
    await prisma.examSitting.update({
      where: { id: sittingId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.startsAt !== undefined ? { startsAt: body.startsAt } : {}),
        ...(body.endsAt !== undefined ? { endsAt: body.endsAt } : {}),
        ...(body.venue !== undefined ? { venue: body.venue } : {}),
        ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
        ...(ipAllowlist !== undefined ? { ipAllowlist } : {}),
      },
    });
    await auditExam(actor, request, "exam.sitting.update", { type: "ExamSitting", id: sittingId }, {
      before: {
        name: before.name,
        startsAt: before.startsAt,
        endsAt: before.endsAt,
        venue: before.venue,
        capacity: before.capacity,
        ipAllowlist: before.ipAllowlist,
      },
      after: { ...body, ...(ipAllowlist ? { ipAllowlist } : {}) },
    });
    return ok({ id: sittingId });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id, sittingId } = await ctx.params;
    await findExam(actor.tenantId, id);
    const sitting = await findSitting(id, sittingId);
    const live = await prisma.examAttempt.count({
      where: { examId: id, status: { in: [...LIVE_ATTEMPT_STATUSES] }, candidate: { sittingId } },
    });
    if (live > 0) {
      throw new DomainError(409, "sitting_live", "Candidates in this sitting are sitting the exam right now. Wait until they finish.");
    }
    await prisma.examSitting.delete({ where: { id: sittingId } });
    await auditExam(actor, request, "exam.sitting.delete", { type: "ExamSitting", id: sittingId }, {
      before: { examId: id, name: sitting.name },
    });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
