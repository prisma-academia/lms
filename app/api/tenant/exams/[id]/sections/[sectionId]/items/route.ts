import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { DomainError, handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { assertPaperEditable, auditExam, findExam } from "@/lib/exams/admin";

const Body = z.object({
  items: z
    .array(
      z.object({
        questionId: z.string().min(1),
        points: z.number().int().min(0).max(1000).nullable().optional(),
      })
    )
    .max(500),
});

/** Replace the hand-picked questions of one section, in the order given. */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string; sectionId: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id, sectionId } = await ctx.params;
    const { items: raw } = Body.parse(await request.json());
    await findExam(actor.tenantId, id);
    const section = await prisma.examSection.findFirst({ where: { id: sectionId, examId: id }, select: { id: true } });
    if (!section) throw new DomainError(404, "not_found", "Section not found.");
    await assertPaperEditable(id);

    const byId = new Map(raw.map((it) => [it.questionId, it]));
    const items = [...byId.values()];
    if (items.length) {
      const found = await prisma.question.count({ where: { id: { in: items.map((i) => i.questionId) }, tenantId: actor.tenantId } });
      if (found !== items.length) {
        throw new DomainError(400, "invalid_questions", "One or more questions are not in this academy's banks.");
      }
      // A question's id is its answer key on the paper, so it can appear once per exam.
      const elsewhere = await prisma.examSectionItem.findMany({
        where: { questionId: { in: items.map((i) => i.questionId) }, section: { examId: id }, sectionId: { not: sectionId } },
        select: { section: { select: { title: true } } },
      });
      if (elsewhere.length) {
        throw new DomainError(
          409,
          "duplicate_question",
          `${elsewhere.length === 1 ? "A question is" : `${elsewhere.length} questions are`} already in "${elsewhere[0].section.title}". A question can appear only once in an exam.`
        );
      }
    }

    await prisma.$transaction([
      prisma.examSectionItem.deleteMany({ where: { sectionId } }),
      ...(items.length
        ? [
            prisma.examSectionItem.createMany({
              data: items.map((it, i) => ({
                tenantId: actor.tenantId,
                sectionId,
                questionId: it.questionId,
                sortOrder: i,
                points: it.points ?? null,
              })),
            }),
          ]
        : []),
    ]);
    await auditExam(actor, request, "exam.section.items", { type: "ExamSection", id: sectionId }, {
      after: { examId: id, count: items.length, questionIds: items.map((i) => i.questionId) },
    });
    return ok({ count: items.length });
  } catch (e) {
    return handleError(e);
  }
}
