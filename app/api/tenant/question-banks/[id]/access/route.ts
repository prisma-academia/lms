import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const SetBody = z.object({ userGroupIds: z.array(z.string().min(1)).max(200) });

/** Replace the user groups a question bank is shared with (empty = all staff). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id } = await ctx.params;
    const { userGroupIds } = SetBody.parse(await request.json());

    const bank = await prisma.questionBank.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!bank) throw new DomainError(404, "not_found", "Question bank not found.");

    const unique = [...new Set(userGroupIds)];
    if (unique.length > 0) {
      const found = await prisma.userGroup.findMany({ where: { id: { in: unique } }, select: { id: true } });
      if (found.length !== unique.length) {
        throw new DomainError(400, "invalid_groups", "One or more user groups do not belong to this tenant.");
      }
    }

    await prisma.$transaction([
      prisma.questionBankAccess.deleteMany({ where: { bankId: id } }),
      ...(unique.length > 0
        ? [
            prisma.questionBankAccess.createMany({
              data: unique.map((userGroupId) => ({ tenantId: actor.tenantId, bankId: id, userGroupId })),
            }),
          ]
        : []),
    ]);
    return ok({ count: unique.length });
  } catch (e) {
    return handleError(e);
  }
}
