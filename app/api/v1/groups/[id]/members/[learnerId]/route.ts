import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { audit } from "@/lib/auth/audit";
import { DomainError } from "@/lib/api/errors";

/** DELETE /api/v1/groups/{id}/members/{learnerId} */
export const DELETE = apiRoute<{ id: string; learnerId: string }>({ scope: "groups:write" }, async (ctx) => {
  const group = await prisma.clientGroup.findFirst({ where: { id: ctx.params.id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!group) throw new DomainError(404, "not_found", "Group not found.");
  const res = await prisma.clientGroupMembership.deleteMany({
    where: { tenantId: ctx.tenantId, groupId: group.id, clientId: ctx.params.learnerId },
  });
  if (res.count === 0) throw new DomainError(404, "not_found", "That learner is not in this group.");
  await audit({ ...ctx.auditActor, action: "client_group.remove_member", targetType: "ClientGroup", targetId: group.id, after: { learnerId: ctx.params.learnerId } });
  return { data: { removed: true } };
});
