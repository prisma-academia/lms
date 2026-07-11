import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_GROUPS_READ.key);
    const { id } = await ctx.params;
    const group = await prisma.userGroup.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        memberships: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!group) throw new DomainError(404, "not_found", "User group not found.");
    return ok({ group });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_GROUPS_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());
    const meta = requestMeta(request);

    const before = await prisma.userGroup.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!before) throw new DomainError(404, "not_found", "User group not found.");

    if (body.name && body.name !== before.name) {
      const clash = await prisma.userGroup.findUnique({
        where: { tenantId_name: { tenantId: actor.tenantId, name: body.name } },
      });
      if (clash) throw new DomainError(409, "name_taken", "A user group with that name already exists.");
    }

    const group = await prisma.userGroup.update({ where: { id }, data: body });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "user_group.update",
      tenantId: actor.tenantId,
      targetType: "UserGroup",
      targetId: group.id,
      before: { name: before.name } as object,
      after: { name: group.name } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ group });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_GROUPS_WRITE.key);
    const { id } = await ctx.params;
    const group = await prisma.userGroup.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!group) throw new DomainError(404, "not_found", "User group not found.");
    await prisma.userGroup.delete({ where: { id } });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "user_group.delete",
      tenantId: actor.tenantId,
      targetType: "UserGroup",
      targetId: id,
      before: { name: group.name } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
