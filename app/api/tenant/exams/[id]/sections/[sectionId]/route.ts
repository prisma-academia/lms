import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { DomainError, handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { assertBanksAccessible, assertPaperEditable, auditExam, findExam, poolsSchema } from "@/lib/exams/admin";

const PatchBody = z.object({
  title: z.string().trim().min(1, "Give the section a title.").max(200).optional(),
  instructions: z.string().max(5000).nullable().optional(),
  timeLimitMin: z.number().int().min(1).max(1440).nullable().optional(),
  shuffle: z.boolean().optional(),
  poolsJson: poolsSchema.optional(),
});

type Ctx = { params: Promise<{ id: string; sectionId: string }> };

async function findSection(examId: string, sectionId: string) {
  const section = await prisma.examSection.findFirst({ where: { id: sectionId, examId } });
  if (!section) throw new DomainError(404, "not_found", "Section not found.");
  return section;
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id, sectionId } = await ctx.params;
    const body = PatchBody.parse(await request.json());
    await findExam(actor.tenantId, id);
    const before = await findSection(id, sectionId);

    // Titles and instructions are wording; timing, shuffling and pools change
    // the paper itself.
    if (body.timeLimitMin !== undefined || body.shuffle !== undefined || body.poolsJson !== undefined) {
      await assertPaperEditable(id);
    }
    if (body.poolsJson) await assertBanksAccessible(actor, body.poolsJson.map((r) => r.bankId));

    const section = await prisma.examSection.update({
      where: { id: sectionId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.instructions !== undefined ? { instructions: body.instructions?.trim() || null } : {}),
        ...(body.timeLimitMin !== undefined ? { timeLimitMin: body.timeLimitMin } : {}),
        ...(body.shuffle !== undefined ? { shuffle: body.shuffle } : {}),
        ...(body.poolsJson !== undefined ? { poolsJson: body.poolsJson as object[] } : {}),
      },
    });
    await auditExam(actor, request, "exam.section.update", { type: "ExamSection", id: sectionId }, {
      before: { title: before.title, timeLimitMin: before.timeLimitMin, shuffle: before.shuffle, poolsJson: before.poolsJson },
      after: body,
    });
    return ok({ section: { id: section.id } });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id, sectionId } = await ctx.params;
    await findExam(actor.tenantId, id);
    const section = await findSection(id, sectionId);
    await assertPaperEditable(id);
    const count = await prisma.examSection.count({ where: { examId: id } });
    if (count <= 1) {
      throw new DomainError(409, "last_section", "An exam needs at least one section. Rename this one instead.");
    }
    await prisma.examSection.delete({ where: { id: sectionId } });
    await auditExam(actor, request, "exam.section.delete", { type: "ExamSection", id: sectionId }, {
      before: { examId: id, title: section.title },
    });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
