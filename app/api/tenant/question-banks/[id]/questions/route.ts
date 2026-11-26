import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { questionTypeSchema } from "@/lib/schemas/question";
import { essayRubricSchema } from "@/lib/schemas/essay-grading";

const CreateBody = z
  .object({
    type: questionTypeSchema,
    prompt: z.string().min(1).max(5000),
    options: z.array(z.string().max(1000)).max(26).optional(),
    answer: z.array(z.union([z.number().int(), z.string()])).optional(),
    rubric: essayRubricSchema.nullable().optional(),
    points: z.number().int().min(0).max(1000).optional(),
    tagIds: z.array(z.string().min(1)).max(50).optional(),
    /** A nudge shown on request while answering. */
    hint: z.string().max(500).nullable().optional(),
  })
  // An ESSAY without a rubric is ungradeable, and a rubric on any other type is
  // dead weight that would confuse the grader later. Reject both at the edge.
  .refine((b) => b.type !== "ESSAY" || b.rubric != null, {
    message: "Essay questions need a rubric.",
    path: ["rubric"],
  })
  .refine((b) => b.type === "ESSAY" || b.rubric == null, {
    message: "Only essay questions take a rubric.",
    path: ["rubric"],
  });

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id: bankId } = await ctx.params;
    const body = CreateBody.parse(await request.json());

    const bank = await prisma.questionBank.findFirst({ where: { id: bankId, tenantId: actor.tenantId } });
    if (!bank) throw new DomainError(404, "not_found", "Question bank not found.");

    if (body.tagIds && body.tagIds.length > 0) {
      const found = await prisma.questionTag.findMany({ where: { id: { in: body.tagIds } }, select: { id: true } });
      if (found.length !== new Set(body.tagIds).size) {
        throw new DomainError(400, "invalid_tags", "One or more tags do not belong to this tenant.");
      }
    }

    const question = await prisma.question.create({
      data: {
        tenantId: actor.tenantId,
        bankId,
        type: body.type,
        prompt: body.prompt,
        optionsJson: (body.options ?? []) as object,
        answerJson: (body.answer ?? []) as object,
        rubricJson: body.type === "ESSAY" ? (body.rubric as object) : undefined,
        points: body.points ?? 1,
        hint: body.hint?.trim() || null,
        tags: body.tagIds
          ? { create: [...new Set(body.tagIds)].map((tagId) => ({ tenantId: actor.tenantId, tagId })) }
          : undefined,
      },
      include: { tags: { include: { tag: { select: { id: true, name: true } } } } },
    });
    return ok({ question }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
