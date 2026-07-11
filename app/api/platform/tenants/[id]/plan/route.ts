import { addDays } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requirePlatformActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { env } from "@/lib/env";
import { daysUntilTrialEnd, formatBytes, storageUsagePercent } from "@/lib/tenant/plan";

const PlanBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("extend_trial"),
    days: z.number().int().positive().max(365).optional(),
  }),
  z.object({
    action: z.literal("activate_manual"),
    planId: z.string().min(1),
  }),
]);

function serializeTenant(tenant: {
  storageUsedBytes: bigint;
  storageQuotaBytes: bigint;
  trialEndsAt: Date | null;
  createdAt: Date;
  archivedAt: Date | null;
  subscriptionEndsAt: Date | null;
  [key: string]: unknown;
}) {
  return {
    ...tenant,
    storageUsedBytes: tenant.storageUsedBytes.toString(),
    storageQuotaBytes: tenant.storageQuotaBytes.toString(),
    storageUsedLabel: formatBytes(tenant.storageUsedBytes),
    storageQuotaLabel: formatBytes(tenant.storageQuotaBytes),
    storagePercent: storageUsagePercent(tenant.storageUsedBytes, tenant.storageQuotaBytes),
    trialDaysLeft: daysUntilTrialEnd(tenant.trialEndsAt),
    createdAt: tenant.createdAt.toISOString(),
    archivedAt: tenant.archivedAt?.toISOString() ?? null,
    trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
    subscriptionEndsAt: tenant.subscriptionEndsAt?.toISOString() ?? null,
  };
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requirePlatformActor(PERMISSIONS.PLATFORM_TENANTS_WRITE.key);
    const { id } = await ctx.params;
    const body = PlanBody.parse(await request.json());
    const meta = requestMeta(request);

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new DomainError(404, "not_found", "Tenant not found.");

    if (body.action === "extend_trial") {
      const days = body.days ?? env.TENANT_TRIAL_DAYS;
      const base =
        tenant.trialEndsAt && tenant.trialEndsAt.getTime() > Date.now()
          ? tenant.trialEndsAt
          : new Date();
      const trialEndsAt = addDays(base, days);

      const updated = await prisma.tenant.update({
        where: { id },
        data: {
          plan: "TRIAL",
          trialEndsAt,
          subscriptionStatus: "NONE",
          subscriptionPlanId: null,
          subscriptionEndsAt: null,
          billingProvider: null,
          status: tenant.status === "SUSPENDED" ? "ACTIVE" : tenant.status,
        },
        include: { subscriptionPlan: true, subaccount: true },
      });

      await audit({
        actorType: "PLATFORM_USER",
        actorId: actor.userId,
        action: "tenant.extend_trial",
        tenantId: id,
        targetType: "Tenant",
        targetId: id,
        before: { trialEndsAt: tenant.trialEndsAt },
        after: { trialEndsAt, daysAdded: days },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return ok({ tenant: serializeTenant(updated) });
    }

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: body.planId } });
    if (!plan) throw new DomainError(404, "plan_not_found", "Subscription plan not found.");

    const subscriptionEndsAt = new Date();
    subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + 1);

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        plan: "ACTIVE",
        subscriptionStatus: "ACTIVE",
        subscriptionPlanId: plan.id,
        subscriptionEndsAt,
        storageQuotaBytes: plan.storageQuotaBytes,
        billingProvider: "MANUAL",
        status: tenant.status === "SUSPENDED" ? "ACTIVE" : tenant.status,
      },
      include: { subscriptionPlan: true, subaccount: true },
    });

    await audit({
      actorType: "PLATFORM_USER",
      actorId: actor.userId,
      action: "tenant.activate_manual_plan",
      tenantId: id,
      targetType: "Tenant",
      targetId: id,
      before: {
        plan: tenant.plan,
        subscriptionPlanId: tenant.subscriptionPlanId,
      },
      after: {
        plan: "ACTIVE",
        subscriptionPlanId: plan.id,
        planCode: plan.code,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok({ tenant: serializeTenant(updated) });
  } catch (e) {
    return handleError(e);
  }
}
