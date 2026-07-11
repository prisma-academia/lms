import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requirePlatformActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  priceMonthlyCents: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  storageQuotaBytes: z.number().int().min(0).optional(),
  maxLearners: z.number().int().min(0).nullable().optional(),
  maxInstructors: z.number().int().min(0).nullable().optional(),
  maxCourses: z.number().int().min(0).nullable().optional(),
  isPublic: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

function serialize(p: { storageQuotaBytes: bigint } & Record<string, unknown>) {
  return { ...p, storageQuotaBytes: p.storageQuotaBytes.toString() };
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requirePlatformActor(PERMISSIONS.PLATFORM_PLANS_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());

    const before = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!before) throw new DomainError(404, "not_found", "Plan not found.");

    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...body,
        ...(body.storageQuotaBytes !== undefined
          ? { storageQuotaBytes: BigInt(body.storageQuotaBytes) }
          : {}),
      },
    });
    const meta = requestMeta(request);
    await audit({
      actorType: "PLATFORM_USER",
      actorId: actor.userId,
      action: "subscription_plan.update",
      tenantId: null,
      targetType: "SubscriptionPlan",
      targetId: plan.id,
      after: { name: plan.name } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ plan: serialize(plan) });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requirePlatformActor(PERMISSIONS.PLATFORM_PLANS_WRITE.key);
    const { id } = await ctx.params;
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id },
      include: { _count: { select: { tenants: true } } },
    });
    if (!plan) throw new DomainError(404, "not_found", "Plan not found.");
    if (plan._count.tenants > 0) {
      throw new DomainError(409, "plan_in_use", "Cannot delete a plan that tenants are subscribed to.");
    }
    await prisma.subscriptionPlan.delete({ where: { id } });
    const meta = requestMeta(request);
    await audit({
      actorType: "PLATFORM_USER",
      actorId: actor.userId,
      action: "subscription_plan.delete",
      tenantId: null,
      targetType: "SubscriptionPlan",
      targetId: id,
      before: { code: plan.code } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
