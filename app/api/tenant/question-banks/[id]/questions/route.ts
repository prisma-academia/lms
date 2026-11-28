import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { questionColumns, questionWriteSchema } from "@/lib/assessments/question-io";
import { Prisma } from "@/lib/generated/prisma/client";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id: bankId } = await ctx.params;
    const body = questionWriteSchema.parse(await request.json());

    const bank = await prisma.questionBank.findFirst({ where: { id: bankId, tenantId: actor.tenantId } });
    if (!bank) throw new DomainError(404, "not_found", "Question bank not found.");

    if (body.tagIds && body.tagIds.length > 0) {
      const found = await prisma.questionTag.findMany({ where: { id: { in: body.tagIds } }, select: { id: true } });
      if (found.length !== new Set(body.tagIds).size) {
        throw new DomainError(400, "invalid_tags", "One or more tags do not belong to this tenant.");
      }
    }
    if (body.groupId) {
      const group = await prisma.questionGroup.findFirst({ where: { id: body.groupId, bankId }, select: { id: true } });
      if (!group) throw new DomainError(400, "invalid_group", "That passage is not in this bank.");
    }

    const columns = questionColumns({
      type: body.type,
      prompt: body.prompt,
      options: body.options,
      answer: body.answer,
      rubric: body.rubric,
    });

    const question = await prisma.question.create({
      data: {
        tenantId: actor.tenantId,
        bankId,
        ...columns,
        rubricJson: columns.rubricJson ?? Prisma.DbNull,
        points: body.points ?? 1,
        hint: body.hint?.trim() || null,
        difficulty: body.difficulty ?? null,
        explanation: body.explanation?.trim() || null,
        negativePoints: body.negativePoints ?? null,
        partialCredit: body.partialCredit ?? false,
        mediaJson: body.media ? (body.media as object) : Prisma.DbNull,
        groupId: body.groupId ?? null,
        tags: body.tagIds
          ? { create: [...new Set(body.tagIds)].map((tagId) => ({ tenantId: actor.tenantId, tagId })) }
          : undefined,
      },
      include: { tags: { include: { tag: { select: { id: true, name: true } } } } },
    });

    // A near-identical question already in the bank is worth flagging, not refusing.
    const duplicates = await prisma.question.count({
      where: { bankId, promptHash: columns.promptHash, id: { not: question.id } },
    });
    return ok({ question, duplicates }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
