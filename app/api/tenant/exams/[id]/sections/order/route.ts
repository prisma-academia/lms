import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { DomainError, handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { assertPaperEditable, auditExam, findExam } from "@/lib/exams/admin";

const Body = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) });

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id } = await ctx.params;
    const { ids } = Body.parse(await request.json());
    await findExam(actor.tenantId, id);
    await assertPaperEditable(id);

    const sections = await prisma.examSection.findMany({ where: { examId: id }, select: { id: true } });
    const known = new Set(sections.map((s) => s.id));
    if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((s) => !known.has(s))) {
      throw new DomainError(400, "invalid_order", "The new order must list every section of this exam exactly once. Reload and try again.");
    }
    await prisma.$transaction(ids.map((sid, i) => prisma.examSection.update({ where: { id: sid }, data: { sortOrder: i } })));
    await auditExam(actor, request, "exam.section.reorder", { type: "Exam", id }, { after: { ids } });
    return ok({ ids });
  } catch (e) {
    return handleError(e);
  }
}
