import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";

const SetBody = z.object({
  userIds: z.array(z.string().min(1)).max(1000),
});

/** Replace the full membership set of a user group with the given users. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_GROUPS_WRITE.key);
    const { id } = await ctx.params;
    const { userIds } = SetBody.parse(await request.json());
    const meta = requestMeta(request);

    const group = await prisma.userGroup.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!group) throw new DomainError(404, "not_found", "User group not found.");

    const unique = [...new Set(userIds)];
    if (unique.length > 0) {
      // All targets must belong to this tenant (query is auto-scoped to the tenant).
      const found = await prisma.tenantUser.findMany({
        where: { id: { in: unique } },
        select: { id: true },
      });
      if (found.length !== unique.length) {
        throw new DomainError(400, "invalid_members", "One or more users do not belong to this tenant.");
      }
    }

    await prisma.$transaction([
      prisma.tenantUserGroupMembership.deleteMany({ where: { groupId: id } }),
      ...(unique.length > 0
        ? [
            prisma.tenantUserGroupMembership.createMany({
              data: unique.map((userId) => ({ tenantId: actor.tenantId, groupId: id, userId })),
            }),
          ]
        : []),
    ]);

    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "user_group.set_members",
      tenantId: actor.tenantId,
      targetType: "UserGroup",
      targetId: id,
      after: { count: unique.length } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ count: unique.length });
  } catch (e) {
    return handleError(e);
  }
}
