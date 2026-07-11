import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { canAccessBank } from "@/lib/assessments/bank-access";

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_READ.key);
    const { id } = await ctx.params;
    if (!(await canAccessBank(actor, id))) {
      throw new DomainError(404, "not_found", "Question bank not found.");
    }
    const bank = await prisma.questionBank.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        questions: {
          orderBy: { createdAt: "desc" },
          include: { tags: { include: { tag: { select: { id: true, name: true } } } } },
        },
        accessGroups: { include: { userGroup: { select: { id: true, name: true } } } },
      },
    });
    if (!bank) throw new DomainError(404, "not_found", "Question bank not found.");
    return ok({ bank });
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
    const before = await prisma.questionBank.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!before) throw new DomainError(404, "not_found", "Question bank not found.");
    const bank = await prisma.questionBank.update({ where: { id }, data: body });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "question_bank.update",
      tenantId: actor.tenantId,
      targetType: "QuestionBank",
      targetId: bank.id,
      after: { name: bank.name } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ bank });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id } = await ctx.params;
    const bank = await prisma.questionBank.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!bank) throw new DomainError(404, "not_found", "Question bank not found.");
    await prisma.questionBank.delete({ where: { id } });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "question_bank.delete",
      tenantId: actor.tenantId,
      targetType: "QuestionBank",
      targetId: id,
      before: { name: bank.name } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
