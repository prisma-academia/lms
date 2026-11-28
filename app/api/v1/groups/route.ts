import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { audit } from "@/lib/auth/audit";
import { DomainError } from "@/lib/api/errors";
import { GroupCreate, GroupListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";

/** GET /api/v1/groups */
export const GET = apiRoute({ scope: "groups:read" }, async (ctx) => {
  const q = ctx.query(GroupListQuery);
  const rows = await prisma.clientGroup.findMany({
    where: { tenantId: ctx.tenantId, ...sinceFilter(q, "updatedAt"), ...(q.external_id ? { externalId: q.external_id } : {}) },
    include: { _count: { select: { memberships: true } } },
    ...pageArgs(q, "updatedAt"),
  });
  return page(rows, q, out.group);
});

/** POST /api/v1/groups */
export const POST = apiRoute({ scope: "groups:write" }, async (ctx) => {
  const body = ctx.json(GroupCreate);
  const clash = await prisma.clientGroup.findFirst({
    where: { tenantId: ctx.tenantId, OR: [{ name: body.name }, ...(body.externalId ? [{ externalId: body.externalId }] : [])] },
    select: { name: true },
  });
  if (clash) throw new DomainError(409, "conflict", clash.name === body.name ? "A group with that name already exists." : "Another group already has that externalId.");
  const group = await prisma.clientGroup.create({
    data: { tenantId: ctx.tenantId, name: body.name, description: body.description ?? null, externalId: body.externalId ?? null },
    include: { _count: { select: { memberships: true } } },
  });
  await audit({ ...ctx.auditActor, action: "client_group.create", targetType: "ClientGroup", targetId: group.id, after: { name: group.name } });
  return { data: out.group(group), status: 201 };
});
