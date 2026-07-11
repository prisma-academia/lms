import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";
import { PageHeader, Card } from "@/components/shell";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_SETTINGS_READ.key, {
    skipOnboardingGate: true,
  });
  const tenant = await prisma.tenant.findUnique({
    where: { id: actor.tenantId },
    include: { subaccount: true },
  });
  if (!tenant) redirect("/admin/dashboard");

  const settings = parseTenantSettings(tenant.settingsJson);
  if (settings.onboarding?.completedAt) redirect("/admin/dashboard");

  const logoUrl =
    settings.logoKey && s3Configured() ? publicUrlForKey(settings.logoKey) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Set up your academy" />
      <Card>
        <OnboardingWizard
          initial={{
            tenantName: tenant.name,
            companyEmail: tenant.companyEmail,
            companyPhone: tenant.companyPhone,
            website: tenant.website,
            addressLine1: tenant.addressLine1,
            city: tenant.city,
            region: tenant.region,
            country: tenant.country,
            settings: {
              primaryColor: settings.primaryColor,
              timezone: settings.timezone,
              locale: settings.locale,
              currency: settings.currency,
              logoKey: settings.logoKey,
              logoUrl,
            },
            completedSteps: settings.onboarding?.completedSteps ?? [],
            subaccount: tenant.subaccount
              ? {
                  businessName: tenant.subaccount.businessName,
                  settlementBankCode: tenant.subaccount.settlementBankCode,
                  settlementAccountNumber: tenant.subaccount.settlementAccountNumber,
                }
              : null,
          }}
          storageEnabled={s3Configured()}
          supportedLocales={env.SUPPORTED_LOCALES}
          canWriteBilling={hasPermission(actor, PERMISSIONS.TENANT_BILLING_WRITE.key)}
          canWriteCourses={hasPermission(actor, PERMISSIONS.TENANT_COURSES_WRITE.key)}
        />
      </Card>
    </div>
  );
}
