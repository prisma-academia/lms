import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/shell";
import { daysUntilTrialEnd, formatBytes, storageUsagePercent } from "@/lib/tenant/plan";
import { activeGateway, checkoutGatewayName, gatewayLabel, payoutStatus } from "@/lib/billing/providers";
import { formatDate, formatDateTime } from "@/lib/format";
import { env } from "@/lib/env";
import { PLATFORM_FORMAT } from "../../format";
import { TenantDetailTabs } from "./tenant-tabs";

/**
 * Whether the gateway taking payments is on its test or its live system, when
 * that can be known. Only Monnify says: MONNIFY_ENV if it is set, otherwise the
 * address the app is actually calling. Shown so nobody mistakes sandbox money
 * for real money, or the other way round.
 */
function gatewayMode(): "Sandbox" | "Live" | null {
  if (checkoutGatewayName() !== "MONNIFY") return null;
  const declared = (env.MONNIFY_ENV ?? "").trim().toLowerCase();
  if (["live", "production", "prod"].includes(declared)) return "Live";
  if (["sandbox", "test", "testing", "dev", "development"].includes(declared)) return "Sandbox";
  try {
    return new URL(env.MONNIFY_BASE_URL).hostname.startsWith("sandbox.") ? "Sandbox" : "Live";
  } catch {
    return null;
  }
}

export default async function TenantDrilldownPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const rawTab = (await searchParams).tab;
  const initialTab = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  await requirePlatformPage(PERMISSIONS.PLATFORM_TENANTS_READ.key);
  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      subscriptionPlan: true,
      subaccount: true,
      _count: { select: { users: true, clients: true, courses: true } },
    },
  });
  if (!tenant) notFound();

  const [enrollmentCount, users, plans, recent] = await Promise.all([
    prisma.enrollment.count({ where: { tenantId: id } }),
    prisma.tenantUser.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isOwner: true,
        status: true,
        lastLoginAt: true,
      },
    }),
    prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.activityLog.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div>
      <PageHeader title={tenant.name} backHref="/tenants" backLabel="Academies" />
      <TenantDetailTabs
        initialTab={initialTab}
        tenant={{
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          plan: tenant.plan,
          trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
          // Formatted here: the tabs are a Client Component and must not
          // format dates themselves (see lib/format.ts).
          trialEndsLabel: tenant.trialEndsAt ? formatDate(tenant.trialEndsAt, PLATFORM_FORMAT) : null,
          trialDaysLeft: daysUntilTrialEnd(tenant.trialEndsAt),
          subscriptionStatus: tenant.subscriptionStatus,
          subscriptionEndsAt: tenant.subscriptionEndsAt?.toISOString() ?? null,
          subscriptionEndsLabel: tenant.subscriptionEndsAt
            ? formatDate(tenant.subscriptionEndsAt, PLATFORM_FORMAT)
            : null,
          storageUsedLabel: formatBytes(tenant.storageUsedBytes),
          storageQuotaLabel: formatBytes(tenant.storageQuotaBytes),
          storagePercent: storageUsagePercent(tenant.storageUsedBytes, tenant.storageQuotaBytes),
          companyEmail: tenant.companyEmail,
          companyPhone: tenant.companyPhone,
          website: tenant.website,
          addressLine1: tenant.addressLine1,
          addressLine2: tenant.addressLine2,
          city: tenant.city,
          region: tenant.region,
          postalCode: tenant.postalCode,
          country: tenant.country,
          createdAt: tenant.createdAt.toISOString(),
          subscriptionPlan: tenant.subscriptionPlan
            ? {
                id: tenant.subscriptionPlan.id,
                name: tenant.subscriptionPlan.name,
                code: tenant.subscriptionPlan.code,
              }
            : null,
          // Payouts are reported for the gateway that takes payments today,
          // whichever older gateways this academy was once set up on.
          paymentsAvailable: activeGateway() !== null,
          payoutGateway: gatewayLabel(checkoutGatewayName()),
          payoutGatewayMode: activeGateway() ? gatewayMode() : null,
          subaccount: tenant.subaccount
            ? {
                payoutStatus: payoutStatus(tenant.subaccount, checkoutGatewayName()),
                payoutCode: tenant.subaccount.monnifySubaccountCode,
                commissionPct: tenant.subaccount.platformCommissionPct,
                courseSalesEnabled: tenant.subaccount.courseSalesEnabled,
                businessName: tenant.subaccount.businessName,
              }
            : null,
        }}
        counts={{
          users: tenant._count.users,
          learners: tenant._count.clients,
          courses: tenant._count.courses,
          enrollments: enrollmentCount,
        }}
        users={users.map((u) => ({
          ...u,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          lastLoginLabel: formatDateTime(u.lastLoginAt, PLATFORM_FORMAT, "Never"),
        }))}
        plans={plans.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          priceMonthlyCents: p.priceMonthlyCents,
          storageQuotaBytes: p.storageQuotaBytes.toString(),
        }))}
        activity={recent.map((l) => ({
          id: l.id,
          action: l.action,
          createdAt: l.createdAt.toISOString(),
          createdLabel: formatDateTime(l.createdAt, PLATFORM_FORMAT),
        }))}
      />
    </div>
  );
}
