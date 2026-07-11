import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { daysUntilTrialEnd, formatBytes, storageUsagePercent } from "@/lib/tenant/plan";

export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_BILLING_READ.key);
    const tenant = await prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      include: { subscriptionPlan: true, subaccount: true },
    });
    if (!tenant) return ok({ subscription: null });

    const plans = await prisma.subscriptionPlan.findMany({
      where: { isPublic: true },
      orderBy: { sortOrder: "asc" },
    });

    const payments = await prisma.platformPayment.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return ok({
      tenant: {
        plan: tenant.plan,
        trialEndsAt: tenant.trialEndsAt,
        trialDaysLeft: daysUntilTrialEnd(tenant.trialEndsAt),
        subscriptionStatus: tenant.subscriptionStatus,
        subscriptionEndsAt: tenant.subscriptionEndsAt,
        storageUsedBytes: tenant.storageUsedBytes.toString(),
        storageQuotaBytes: tenant.storageQuotaBytes.toString(),
        storageUsedLabel: formatBytes(tenant.storageUsedBytes),
        storageQuotaLabel: formatBytes(tenant.storageQuotaBytes),
        storagePercent: storageUsagePercent(tenant.storageUsedBytes, tenant.storageQuotaBytes),
        currentPlan: tenant.subscriptionPlan,
      },
      plans,
      subaccount: tenant.subaccount,
      payments,
    });
  } catch (e) {
    return handleError(e);
  }
}
