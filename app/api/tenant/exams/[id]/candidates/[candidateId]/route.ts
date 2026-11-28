import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { DomainError, handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { auditExam, findExam } from "@/lib/exams/admin";
import { candidatePatchSchema } from "@/lib/exams/candidate-admin";

type Ctx = { params: Promise<{ id: string; candidateId: string }> };

async function findCandidate(examId: string, candidateId: string) {
  const c = await prisma.examCandidate.findFirst({ where: { id: candidateId, examId } });
  if (!c) throw new DomainError(404, "not_found", "Candidate not found.");
  return c;
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id, candidateId } = await ctx.params;
    const body = candidatePatchSchema.parse(await request.json());
    await findExam(actor.tenantId, id);
    const before = await findCandidate(id, candidateId);
    if (body.sittingId) {
      const sitting = await prisma.examSitting.findFirst({ where: { id: body.sittingId, examId: id }, select: { id: true } });
      if (!sitting) throw new DomainError(400, "invalid_sitting", "That sitting is not part of this exam.");
    }
    const updated = await prisma.examCandidate.update({
      where: { id: candidateId },
      data: {
        ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
        ...(body.email !== undefined ? { email: body.email?.toLowerCase() ?? null } : {}),
        ...(body.regNumber !== undefined ? { regNumber: body.regNumber } : {}),
        ...(body.sittingId !== undefined ? { sittingId: body.sittingId } : {}),
        ...(body.extraTimePct !== undefined ? { extraTimePct: body.extraTimePct } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });
    await auditExam(actor, request, "exam.candidate.update", { type: "ExamCandidate", id: candidateId }, {
      before: Object.fromEntries(Object.keys(body).map((k) => [k, (before as Record<string, unknown>)[k]])),
      after: body,
    });
    return ok({ candidate: { id: updated.id } });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id, candidateId } = await ctx.params;
    await findExam(actor.tenantId, id);
    const candidate = await findCandidate(id, candidateId);
    const attempts = await prisma.examAttempt.count({ where: { candidateId } });
    if (attempts > 0) {
      throw new DomainError(
        409,
        "has_attempts",
        `${candidate.fullName} has already sat this exam, so their record stays. Set them to Withdrawn or Blocked instead.`
      );
    }
    await prisma.examCandidate.delete({ where: { id: candidateId } });
    await auditExam(actor, request, "exam.candidate.delete", { type: "ExamCandidate", id: candidateId }, {
      before: { examId: id, fullName: candidate.fullName, candidateNo: candidate.candidateNo },
    });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
