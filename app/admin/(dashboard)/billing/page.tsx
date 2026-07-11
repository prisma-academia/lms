import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { daysUntilTrialEnd, formatBytes, storageUsagePercent } from "@/lib/tenant/plan";
import { PageHeader, Card } from "@/components/shell";
import { BillingPanel } from "./billing-panel";

export default async function BillingPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_BILLING_READ.key);

  const tenant = await prisma.tenant.findUnique({
    where: { id: actor.tenantId },
    include: { subscriptionPlan: true, subaccount: true },
  });

  const plans = await prisma.subscriptionPlan.findMany({
    where: { isPublic: true },
    orderBy: { sortOrder: "asc" },
  });

  const payments = tenant
    ? await prisma.platformPayment.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    : [];

  const billing = tenant
    ? {
        plan: tenant.plan,
        trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
        trialDaysLeft: daysUntilTrialEnd(tenant.trialEndsAt),
        subscriptionStatus: tenant.subscriptionStatus,
        subscriptionEndsAt: tenant.subscriptionEndsAt?.toISOString() ?? null,
        storageUsedLabel: formatBytes(tenant.storageUsedBytes),
        storageQuotaLabel: formatBytes(tenant.storageQuotaBytes),
        storagePercent: storageUsagePercent(
          tenant.storageUsedBytes,
          tenant.storageQuotaBytes
        ),
        currentPlan: tenant.subscriptionPlan
          ? {
              id: tenant.subscriptionPlan.id,
              name: tenant.subscriptionPlan.name,
              code: tenant.subscriptionPlan.code,
              priceMonthlyCents: tenant.subscriptionPlan.priceMonthlyCents,
              currency: tenant.subscriptionPlan.currency,
            }
          : null,
      }
    : null;

  const planRows = plans.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    priceMonthlyCents: p.priceMonthlyCents,
    currency: p.currency,
    storageQuotaLabel: formatBytes(p.storageQuotaBytes),
    maxLearners: p.maxLearners,
    maxCourses: p.maxCourses,
  }));

  const subaccount = tenant?.subaccount
    ? {
        businessName: tenant.subaccount.businessName,
        businessEmail: tenant.subaccount.businessEmail,
        businessPhone: tenant.subaccount.businessPhone,
        settlementBankCode: tenant.subaccount.settlementBankCode,
        settlementAccountNumber: tenant.subaccount.settlementAccountNumber,
        settlementAccountName: tenant.subaccount.settlementAccountName,
        courseSalesEnabled: tenant.subaccount.courseSalesEnabled,
        defaultProvider: (tenant.subaccount.defaultProvider === "PAYSTACK"
          ? "paystack"
          : tenant.subaccount.defaultProvider === "FLUTTERWAVE"
            ? "flutterwave"
            : null) as "paystack" | "flutterwave" | null,
        paystackStatus: tenant.subaccount.paystackStatus,
        flutterwaveStatus: tenant.subaccount.flutterwaveStatus,
      }
    : null;

  const paymentRows = payments.map((p) => ({
    id: p.id,
    amountCents: p.amountCents,
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader title="Billing" />
      <Card>
        <BillingPanel
          billing={billing}
          plans={planRows}
          subaccount={subaccount}
          payments={paymentRows}
        />
      </Card>
    </div>
  );
}
