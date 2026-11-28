import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { Prisma } from "@/lib/generated/prisma/client";
import { questionSourceInput, resolveQuestionSource } from "@/lib/assessments/question-source";
import { questionColumns, questionWriteSchema } from "@/lib/assessments/question-io";
import { parseRubric } from "@/lib/schemas/essay-grading";

const PatchBody = questionWriteSchema.partial().extend({
  /** Where the answer is taught; null clears it. */
  source: questionSourceInput.optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());

    const question = await prisma.question.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!question) throw new DomainError(404, "not_found", "Question not found.");

    // The whole question is re-checked against its EFFECTIVE values whenever any
    // part of what is graded changes, since a PATCH may change the type, the
    // options, the key or the prompt (blanks live in the prompt) on its own.
    const nextType = body.type ?? question.type;
    const touchesKey =
      body.type !== undefined || body.prompt !== undefined || body.options !== undefined ||
      body.answer !== undefined || body.rubric !== undefined;
    const columns = touchesKey
      ? questionColumns({
          type: nextType,
          prompt: body.prompt ?? question.prompt,
          options: body.options !== undefined ? body.options : question.optionsJson,
          answer: body.answer !== undefined ? body.answer : question.answerJson,
          rubric:
            nextType === "ESSAY"
              ? body.rubric !== undefined
                ? body.rubric
                : parseRubric(question.rubricJson)
              : body.rubric ?? null,
        })
      : null;
    if (body.groupId) {
      const group = await prisma.questionGroup.findFirst({ where: { id: body.groupId, bankId: question.bankId }, select: { id: true } });
      if (!group) throw new DomainError(400, "invalid_group", "That passage is not in this bank.");
    }

    if (body.tagIds && body.tagIds.length > 0) {
      const found = await prisma.questionTag.findMany({ where: { id: { in: body.tagIds } }, select: { id: true } });
      if (found.length !== new Set(body.tagIds).size) {
        throw new DomainError(400, "invalid_tags", "One or more tags do not belong to this tenant.");
      }
    }

    // Validated before the write: a source naming another academy's lesson, or
    // a heading that is not in the lesson, is rejected here.
    const source =
      body.source !== undefined ? await resolveQuestionSource(actor.tenantId, body.source) : null;

    await prisma.$transaction([
      prisma.question.update({
        where: { id },
        data: {
          ...(body.hint !== undefined ? { hint: body.hint?.trim() || null } : {}),
          ...(source ?? {}),
          ...(columns
            ? {
                type: columns.type,
                prompt: columns.prompt,
                optionsJson: columns.optionsJson,
                answerJson: columns.answerJson,
                promptHash: columns.promptHash,
                // Switching away from ESSAY clears the rubric, so a question can
                // never carry a stale rubric that the grader might later act on.
                rubricJson: columns.rubricJson ?? Prisma.DbNull,
              }
            : {}),
          ...(body.points !== undefined ? { points: body.points } : {}),
          ...(body.difficulty !== undefined ? { difficulty: body.difficulty } : {}),
          ...(body.explanation !== undefined ? { explanation: body.explanation?.trim() || null } : {}),
          ...(body.negativePoints !== undefined ? { negativePoints: body.negativePoints } : {}),
          ...(body.partialCredit !== undefined ? { partialCredit: body.partialCredit } : {}),
          ...(body.media !== undefined ? { mediaJson: body.media ? (body.media as object) : Prisma.DbNull } : {}),
          ...(body.groupId !== undefined ? { groupId: body.groupId } : {}),
        },
      }),
      ...(body.tagIds !== undefined
        ? [
            prisma.questionTagLink.deleteMany({ where: { questionId: id } }),
            ...(body.tagIds.length > 0
              ? [
                  prisma.questionTagLink.createMany({
                    data: [...new Set(body.tagIds)].map((tagId) => ({
                      tenantId: actor.tenantId,
                      questionId: id,
                      tagId,
                    })),
                  }),
                ]
              : []),
          ]
        : []),
    ]);

    const updated = await prisma.question.findFirst({
      where: { id },
      include: { tags: { include: { tag: { select: { id: true, name: true } } } } },
    });
    return ok({ question: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id } = await ctx.params;
    const question = await prisma.question.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!question) throw new DomainError(404, "not_found", "Question not found.");
    await prisma.question.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
