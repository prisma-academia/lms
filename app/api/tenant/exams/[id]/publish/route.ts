import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { auditExam, findExam, publishChecklist } from "@/lib/exams/admin";

/** Publish after the checklist passes. Blocked → 422 with `problems`. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id } = await ctx.params;
    const before = await findExam(actor.tenantId, id);
    const checklist = await publishChecklist(actor.tenantId, id);
    const problems = checklist.filter((c) => c.level === "error").map((c) => `${c.label}: ${c.detail}`);
    if (problems.length) return ok({ ok: false, problems, checklist }, undefined, 422);

    const exam = await prisma.exam.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    await import("@/lib/integrations/events")
      .then(({ emitEvent }) => emitEvent(actor.tenantId, "exam.published", { examId: exam.id, title: exam.title, code: exam.code, opensAt: exam.opensAt?.toISOString() ?? null, closesAt: exam.closesAt?.toISOString() ?? null }))
      .catch(() => undefined);
    await auditExam(actor, request, "exam.publish", { type: "Exam", id }, {
      before: { status: before.status },
      after: { status: exam.status, publishedAt: exam.publishedAt },
    });
    return ok({ ok: true, problems: [], checklist, status: exam.status, publishedAt: exam.publishedAt?.toISOString() ?? null });
  } catch (e) {
    return handleError(e);
  }
}
