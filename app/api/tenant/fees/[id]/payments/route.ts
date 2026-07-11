import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";

const RecordBody = z.object({
  clientId: z.string().min(1),
  status: z.enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED"]).optional(),
  amountCents: z.number().int().min(0).optional(),
  method: z.string().max(60).nullable().optional(),
  paidAt: z.string().datetime().nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

/** Clients this fee applies to (single client or all members of its group). */
async function assignedClientIds(fee: {
  clientId: string | null;
  clientGroupId: string | null;
}): Promise<Set<string>> {
  if (fee.clientId) return new Set([fee.clientId]);
  if (fee.clientGroupId) {
    const members = await prisma.clientGroupMembership.findMany({
      where: { groupId: fee.clientGroupId },
      select: { clientId: true },
    });
    return new Set(members.map((m) => m.clientId));
  }
  return new Set();
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_FEES_WRITE.key);
    const { id } = await ctx.params;
    const body = RecordBody.parse(await request.json());
    const meta = requestMeta(request);

    const fee = await prisma.fee.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!fee) throw new DomainError(404, "not_found", "Fee not found.");

    const allowed = await assignedClientIds(fee);
    if (!allowed.has(body.clientId)) {
      throw new DomainError(400, "not_assigned", "This client is not assigned this fee.");
    }

    const status = body.status ?? "SUCCESS";
    const payment = await prisma.feePayment.upsert({
      where: { feeId_clientId: { feeId: id, clientId: body.clientId } },
      create: {
        tenantId: actor.tenantId,
        feeId: id,
        clientId: body.clientId,
        amountCents: body.amountCents ?? fee.amountCents,
        currency: fee.currency,
        status,
        method: body.method ?? null,
        paidAt: body.paidAt ? new Date(body.paidAt) : status === "SUCCESS" ? new Date() : null,
        note: body.note ?? null,
      },
      update: {
        amountCents: body.amountCents ?? fee.amountCents,
        status,
        method: body.method ?? null,
        paidAt: body.paidAt ? new Date(body.paidAt) : status === "SUCCESS" ? new Date() : null,
        note: body.note ?? null,
      },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "fee.record_payment",
      tenantId: actor.tenantId,
      targetType: "Fee",
      targetId: id,
      after: { clientId: body.clientId, status } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ payment });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_FEES_WRITE.key);
    const { id } = await ctx.params;
    const clientId = new URL(request.url).searchParams.get("clientId");
    if (!clientId) throw new DomainError(400, "missing_client", "clientId is required.");

    const fee = await prisma.fee.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!fee) throw new DomainError(404, "not_found", "Fee not found.");

    await prisma.feePayment.deleteMany({ where: { feeId: id, clientId } });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
