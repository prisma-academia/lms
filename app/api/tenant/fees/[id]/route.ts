import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  amountCents: z.number().int().min(1).optional(),
  currency: z.string().length(3).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_FEES_READ.key);
    const { id } = await ctx.params;
    const fee = await prisma.fee.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        client: { select: { id: true, email: true, firstName: true, lastName: true } },
        clientGroup: { select: { id: true, name: true } },
        payments: true,
      },
    });
    if (!fee) throw new DomainError(404, "not_found", "Fee not found.");
    return ok({ fee });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_FEES_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());

    const before = await prisma.fee.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!before) throw new DomainError(404, "not_found", "Fee not found.");

    const fee = await prisma.fee.update({
      where: { id },
      data: {
        ...body,
        ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}),
      },
    });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "fee.update",
      tenantId: actor.tenantId,
      targetType: "Fee",
      targetId: fee.id,
      after: { name: fee.name } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ fee });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_FEES_WRITE.key);
    const { id } = await ctx.params;
    const fee = await prisma.fee.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!fee) throw new DomainError(404, "not_found", "Fee not found.");
    await prisma.fee.delete({ where: { id } });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "fee.delete",
      tenantId: actor.tenantId,
      targetType: "Fee",
      targetId: id,
      before: { name: fee.name } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
