import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { announce } from "@/lib/exams/proctor";
import { examOr404, staffNames } from "@/lib/exams/ops";

/** Messages to candidates in the exam window: everyone, one sitting, or one candidate. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_PROCTOR.key);
    const { id } = await ctx.params;
    await examOr404(id, actor.tenantId);
    const rows = await prisma.examAnnouncement.findMany({
      where: { examId: id, tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, message: true, sittingId: true, candidateId: true, createdAt: true, createdById: true },
    });
    const [sittings, candidates, users] = await Promise.all([
      prisma.examSitting.findMany({ where: { examId: id, tenantId: actor.tenantId }, select: { id: true, name: true } }),
      prisma.examCandidate.findMany({
        where: { id: { in: rows.map((r) => r.candidateId).filter((x): x is string => !!x) }, tenantId: actor.tenantId },
        select: { id: true, fullName: true, candidateNo: true },
      }),
      staffNames(rows.map((r) => r.createdById), actor.tenantId),
    ]);
    const sittingName = new Map(sittings.map((s) => [s.id, s.name]));
    const candidate = new Map(candidates.map((c) => [c.id, `${c.fullName} (${c.candidateNo})`]));
    const userName = users;
    return ok(
      rows.map((r) => ({
        id: r.id,
        message: r.message,
        at: r.createdAt.toISOString(),
        to: r.candidateId
          ? candidate.get(r.candidateId) ?? "One candidate"
          : r.sittingId
            ? `Sitting: ${sittingName.get(r.sittingId) ?? "removed"}`
            : "Everyone",
        by: r.createdById ? userName.get(r.createdById) ?? "Staff" : null,
      }))
    );
  } catch (e) {
    return handleError(e);
  }
}

const Body = z.object({
  message: z.string().trim().min(1, "Write a message.").max(1000),
  sittingId: z.string().min(1).nullish(),
  candidateId: z.string().min(1).nullish(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_PROCTOR.key);
    const { id } = await ctx.params;
    const body = Body.parse(await request.json());
    await examOr404(id, actor.tenantId);
    if (body.sittingId && body.candidateId) {
      throw new DomainError(400, "validation_error", "Send to a sitting or to one candidate, not both.");
    }
    if (body.sittingId) {
      const s = await prisma.examSitting.findFirst({ where: { id: body.sittingId, examId: id, tenantId: actor.tenantId }, select: { id: true } });
      if (!s) throw new DomainError(404, "not_found", "Sitting not found.");
    }
    if (body.candidateId) {
      const c = await prisma.examCandidate.findFirst({ where: { id: body.candidateId, examId: id, tenantId: actor.tenantId }, select: { id: true } });
      if (!c) throw new DomainError(404, "not_found", "Candidate not found.");
    }
    const row = await announce({
      tenantId: actor.tenantId,
      examId: id,
      message: body.message,
      sittingId: body.sittingId ?? null,
      candidateId: body.candidateId ?? null,
      actorId: actor.userId,
    });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "exam.proctor.announce",
      tenantId: actor.tenantId,
      targetType: "Exam",
      targetId: id,
      after: { announcementId: row.id, sittingId: row.sittingId, candidateId: row.candidateId, message: row.message },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ id: row.id }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
