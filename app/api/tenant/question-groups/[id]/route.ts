import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { Prisma } from "@/lib/generated/prisma/client";
import { passageWriteSchema as PassageBody } from "@/lib/assessments/question-io";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id } = await ctx.params;
    const body = PassageBody.partial().parse(await request.json());
    const group = await prisma.questionGroup.findFirst({ where: { id, tenantId: actor.tenantId }, select: { id: true } });
    if (!group) throw new DomainError(404, "not_found", "Passage not found.");
    const updated = await prisma.questionGroup.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title?.trim() || null } : {}),
        ...(body.stimulus !== undefined ? { stimulusHtml: body.stimulus } : {}),
        ...(body.media !== undefined ? { mediaJson: body.media ? (body.media as object) : Prisma.DbNull } : {}),
      },
    });
    return ok({ group: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id } = await ctx.params;
    const group = await prisma.questionGroup.findFirst({ where: { id, tenantId: actor.tenantId }, select: { id: true } });
    if (!group) throw new DomainError(404, "not_found", "Passage not found.");
    // Questions keep existing; they simply lose the shared passage (SetNull).
    await prisma.questionGroup.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
