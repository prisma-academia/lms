import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { daysUntilTrialEnd, formatBytes, storageUsagePercent } from "@/lib/tenant/plan";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { formatDate } from "@/lib/format";
import { activeGateway, checkoutGatewayName, gatewayLabel, payoutStatus } from "@/lib/billing/providers";
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

  // Dates are formatted here, in the academy's own locale and time zone. The
  // panel is a Client Component: formatting there would run once on the server
  // and again in the browser, in two different locales.
  const settings = parseTenantSettings(tenant?.settingsJson);
  const when = { locale: settings.locale, timeZone: settings.timezone };

  const gateway = activeGateway();

  const billing = tenant
    ? {
        plan: tenant.plan,
        trialEndsLabel: tenant.trialEndsAt ? formatDate(tenant.trialEndsAt, when) : null,
        trialDaysLeft: daysUntilTrialEnd(tenant.trialEndsAt),
        subscriptionStatus: tenant.subscriptionStatus,
        subscriptionEndsLabel: tenant.subscriptionEndsAt ? formatDate(tenant.subscriptionEndsAt, when) : null,
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
        commissionPct: tenant.subaccount.platformCommissionPct,
        // Where the payout account stands on the gateway that takes payments
        // today — not on one the platform used to use.
        payoutStatus: payoutStatus(tenant.subaccount, checkoutGatewayName()),
      }
    : null;

  const paymentRows = payments.map((p) => ({
    id: p.id,
    amountCents: p.amountCents,
    currency: p.currency,
    status: p.status,
    via: gatewayLabel(p.provider),
    dateLabel: formatDate(p.createdAt, when),
  }));

  return (
    <div>
      <PageHeader title="Billing" subtitle="Your plan, your storage, and how you are paid for course sales." />
      <Card>
        <BillingPanel
          billing={billing}
          plans={planRows}
          subaccount={subaccount}
          payments={paymentRows}
          paymentsAvailable={gateway !== null}
        />
      </Card>
    </div>
  );
}
