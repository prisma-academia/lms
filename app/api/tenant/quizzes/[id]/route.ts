import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  passingScore: z.number().int().min(0).max(100).nullable().optional(),
  timeLimitMin: z.number().int().min(1).max(600).nullable().optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_READ.key);
    const { id } = await ctx.params;
    const quiz = await prisma.quiz.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        questions: {
          orderBy: { sortOrder: "asc" },
          include: {
            question: {
              include: { tags: { include: { tag: { select: { id: true, name: true } } } } },
            },
          },
        },
      },
    });
    if (!quiz) throw new DomainError(404, "not_found", "Quiz not found.");
    return ok({ quiz });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());
    const before = await prisma.quiz.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!before) throw new DomainError(404, "not_found", "Quiz not found.");
    const quiz = await prisma.quiz.update({ where: { id }, data: body });
    return ok({ quiz });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id } = await ctx.params;
    const quiz = await prisma.quiz.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!quiz) throw new DomainError(404, "not_found", "Quiz not found.");
    await prisma.quiz.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
