import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { audit } from "@/lib/auth/audit";
import { DomainError } from "@/lib/api/errors";
import { GroupMembersAdd, ListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";

async function requireGroup(tenantId: string, id: string) {
  const g = await prisma.clientGroup.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!g) throw new DomainError(404, "not_found", "Group not found.");
  return g;
}

/** GET /api/v1/groups/{id}/members — the group's learners. */
export const GET = apiRoute<{ id: string }>({ scope: "groups:read" }, async (ctx) => {
  const q = ctx.query(ListQuery);
  await requireGroup(ctx.tenantId, ctx.params.id);
  const rows = await prisma.client.findMany({
    where: { tenantId: ctx.tenantId, groupMemberships: { some: { groupId: ctx.params.id } } },
    ...pageArgs(q, "createdAt"),
  });
  return page(rows, q, out.learner);
});

/** POST /api/v1/groups/{id}/members — add learners (already-members are ignored). */
export const POST = apiRoute<{ id: string }>({ scope: "groups:write" }, async (ctx) => {
  const body = ctx.json(GroupMembersAdd);
  const group = await requireGroup(ctx.tenantId, ctx.params.id);
  const ids = [...new Set(body.learnerIds)];
  const found = await prisma.client.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: { id: true } });
  if (found.length !== ids.length) throw new DomainError(400, "invalid_members", "One or more learners do not belong to this academy.");
  const res = await prisma.clientGroupMembership.createMany({
    data: ids.map((clientId) => ({ tenantId: ctx.tenantId, groupId: group.id, clientId })),
    skipDuplicates: true,
  });
  await audit({ ...ctx.auditActor, action: "client_group.add_members", targetType: "ClientGroup", targetId: group.id, after: { added: res.count } });
  return { data: { added: res.count, alreadyMembers: ids.length - res.count } };
});
