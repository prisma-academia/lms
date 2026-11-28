import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { audit } from "@/lib/auth/audit";
import { DomainError } from "@/lib/api/errors";
import { GroupPatch } from "@/lib/api/v1/schemas";
import * as out from "@/lib/api/v1/serialize";

async function load(tenantId: string, id: string) {
  const g = await prisma.clientGroup.findFirst({ where: { id, tenantId }, include: { _count: { select: { memberships: true } } } });
  if (!g) throw new DomainError(404, "not_found", "Group not found.");
  return g;
}

/** GET /api/v1/groups/{id} */
export const GET = apiRoute<{ id: string }>({ scope: "groups:read" }, async (ctx) => {
  return { data: out.group(await load(ctx.tenantId, ctx.params.id)) };
});

/** PATCH /api/v1/groups/{id} */
export const PATCH = apiRoute<{ id: string }>({ scope: "groups:write" }, async (ctx) => {
  const body = ctx.json(GroupPatch);
  const before = await load(ctx.tenantId, ctx.params.id);
  if (body.name && body.name !== before.name) {
    const clash = await prisma.clientGroup.findFirst({ where: { tenantId: ctx.tenantId, name: body.name, NOT: { id: before.id } }, select: { id: true } });
    if (clash) throw new DomainError(409, "conflict", "A group with that name already exists.");
  }
  if (body.externalId && body.externalId !== before.externalId) {
    const clash = await prisma.clientGroup.findFirst({ where: { tenantId: ctx.tenantId, externalId: body.externalId, NOT: { id: before.id } }, select: { id: true } });
    if (clash) throw new DomainError(409, "conflict", "Another group already has that externalId.");
  }
  const group = await prisma.clientGroup.update({
    where: { id: before.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.externalId !== undefined ? { externalId: body.externalId } : {}),
    },
    include: { _count: { select: { memberships: true } } },
  });
  await audit({ ...ctx.auditActor, action: "client_group.update", targetType: "ClientGroup", targetId: group.id, before: { name: before.name }, after: body });
  return { data: out.group(group) };
});

/**
 * DELETE /api/v1/groups/{id} — the learners stay. As in the admin console,
 * the memberships and any fees / calendar events aimed at this group go too.
 */
export const DELETE = apiRoute<{ id: string }>({ scope: "groups:write" }, async (ctx) => {
  const before = await load(ctx.tenantId, ctx.params.id);
  await prisma.clientGroup.delete({ where: { id: before.id } });
  await audit({ ...ctx.auditActor, action: "client_group.delete", targetType: "ClientGroup", targetId: before.id, before: { name: before.name } });
  return { data: { id: before.id, deleted: true } };
});
