import { prisma } from "@/lib/db/client";
import type { TenantActor } from "@/lib/auth/permissions";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Builds a Prisma `where` filter for question banks the actor may access.
 * Owners and users with quizzes:write see all banks. Other users see banks with
 * no access restrictions, or banks shared with one of their user groups.
 */
export async function accessibleBankWhere(actor: TenantActor): Promise<Prisma.QuestionBankWhereInput> {
  if (actor.isOwner || hasPermission(actor, PERMISSIONS.TENANT_QUIZZES_WRITE.key)) {
    return {};
  }
  const memberships = await prisma.tenantUserGroupMembership.findMany({
    where: { userId: actor.userId },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);
  return {
    OR: [
      { accessGroups: { none: {} } },
      { accessGroups: { some: { userGroupId: { in: groupIds } } } },
    ],
  };
}

/** Whether the actor can access a specific bank (uses the same rules). */
export async function canAccessBank(actor: TenantActor, bankId: string): Promise<boolean> {
  const where = await accessibleBankWhere(actor);
  const bank = await prisma.questionBank.findFirst({
    where: { AND: [{ id: bankId, tenantId: actor.tenantId }, where] },
    select: { id: true },
  });
  return Boolean(bank);
}
