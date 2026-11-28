import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { passageWriteSchema as PassageBody } from "@/lib/assessments/question-io";
import { Prisma } from "@/lib/generated/prisma/client";

/** Passages: a shared stimulus several questions in the bank are asked about. */

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_READ.key);
    const { id: bankId } = await ctx.params;
    const groups = await prisma.questionGroup.findMany({
      where: { bankId, tenantId: actor.tenantId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { questions: true } } },
    });
    return ok({ groups });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id: bankId } = await ctx.params;
    const body = PassageBody.parse(await request.json());
    const bank = await prisma.questionBank.findFirst({ where: { id: bankId, tenantId: actor.tenantId }, select: { id: true } });
    if (!bank) throw new DomainError(404, "not_found", "Question bank not found.");
    const group = await prisma.questionGroup.create({
      data: {
        tenantId: actor.tenantId,
        bankId,
        title: body.title?.trim() || null,
        stimulusHtml: body.stimulus,
        mediaJson: body.media ? (body.media as object) : Prisma.DbNull,
      },
    });
    return ok({ group }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
