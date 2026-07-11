import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const PatchBody = z.object({
  type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"]).optional(),
  prompt: z.string().min(1).max(5000).optional(),
  options: z.array(z.string().max(1000)).max(26).optional(),
  answer: z.array(z.union([z.number().int(), z.string()])).optional(),
  points: z.number().int().min(0).max(1000).optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());

    const question = await prisma.question.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!question) throw new DomainError(404, "not_found", "Question not found.");

    if (body.tagIds && body.tagIds.length > 0) {
      const found = await prisma.questionTag.findMany({ where: { id: { in: body.tagIds } }, select: { id: true } });
      if (found.length !== new Set(body.tagIds).size) {
        throw new DomainError(400, "invalid_tags", "One or more tags do not belong to this tenant.");
      }
    }

    await prisma.$transaction([
      prisma.question.update({
        where: { id },
        data: {
          ...(body.type ? { type: body.type } : {}),
          ...(body.prompt !== undefined ? { prompt: body.prompt } : {}),
          ...(body.options !== undefined ? { optionsJson: body.options as object } : {}),
          ...(body.answer !== undefined ? { answerJson: body.answer as object } : {}),
          ...(body.points !== undefined ? { points: body.points } : {}),
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
