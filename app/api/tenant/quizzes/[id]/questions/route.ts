import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const SetBody = z.object({
  questions: z
    .array(
      z.object({
        questionId: z.string().min(1),
        sortOrder: z.number().int().min(0).optional(),
        points: z.number().int().min(0).max(1000).nullable().optional(),
      })
    )
    .max(500),
});

/** Replace the full set of questions in a quiz. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id } = await ctx.params;
    const { questions } = SetBody.parse(await request.json());

    const quiz = await prisma.quiz.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!quiz) throw new DomainError(404, "not_found", "Quiz not found.");

    const byId = new Map(questions.map((q) => [q.questionId, q]));
    const items = [...byId.values()];
    if (items.length > 0) {
      const found = await prisma.question.findMany({
        where: { id: { in: items.map((q) => q.questionId) } },
        select: { id: true },
      });
      if (found.length !== items.length) {
        throw new DomainError(400, "invalid_questions", "One or more questions do not belong to this tenant.");
      }
    }

    await prisma.$transaction([
      prisma.quizQuestion.deleteMany({ where: { quizId: id } }),
      ...(items.length > 0
        ? [
            prisma.quizQuestion.createMany({
              data: items.map((q, idx) => ({
                tenantId: actor.tenantId,
                quizId: id,
                questionId: q.questionId,
                sortOrder: q.sortOrder ?? idx,
                points: q.points ?? null,
              })),
            }),
          ]
        : []),
    ]);
    return ok({ count: items.length });
  } catch (e) {
    return handleError(e);
  }
}
