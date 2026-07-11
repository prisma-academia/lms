import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/shell";
import { daysUntilTrialEnd, formatBytes, storageUsagePercent } from "@/lib/tenant/plan";
import { TenantDetailTabs } from "./tenant-tabs";

export default async function TenantDrilldownPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
      <PageHeader title={tenant.name} />
      <TenantDetailTabs
        tenant={{
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          plan: tenant.plan,
          trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
          trialDaysLeft: daysUntilTrialEnd(tenant.trialEndsAt),
          subscriptionStatus: tenant.subscriptionStatus,
          subscriptionEndsAt: tenant.subscriptionEndsAt?.toISOString() ?? null,
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
          subaccount: tenant.subaccount
            ? {
                paystackStatus: tenant.subaccount.paystackStatus,
                flutterwaveStatus: tenant.subaccount.flutterwaveStatus,
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
        }))}
      />
    </div>
  );
}
