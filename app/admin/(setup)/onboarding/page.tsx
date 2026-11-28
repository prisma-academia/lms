import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";
import { getCountryOptions } from "@/lib/geo/countries";
import { getCurrencyOptions } from "@/lib/geo/currencies";
import { getLocaleOptions } from "@/lib/geo/locales";
import { getTimezoneOptions } from "@/lib/geo/timezones";
import { PageHeader } from "@/components/shell";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_SETTINGS_READ.key, {
    skipOnboardingGate: true,
  });
  // The wizard saves academy settings at every step. Someone who cannot is not
  // shown a form whose every Continue would be refused.
  if (!hasPermission(actor, PERMISSIONS.TENANT_SETTINGS_WRITE.key)) redirect("/admin/dashboard");

  const [tenant, me, courseCount] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      include: { subaccount: true },
    }),
    prisma.tenantUser.findUnique({
      where: { id: actor.userId },
      select: { firstName: true, lastName: true, phone: true, email: true },
    }),
    prisma.course.count({ where: { tenantId: actor.tenantId } }),
  ]);
  if (!tenant || !me) redirect("/admin/dashboard");

  const settings = parseTenantSettings(tenant.settingsJson);
  if (settings.onboarding?.completedAt) redirect("/admin/dashboard");

  const storageEnabled = s3Configured();
  const logoUrl = settings.logoKey && storageEnabled ? publicUrlForKey(settings.logoKey) : null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Set up your academy"
        subtitle="A few details so your academy looks and works the way you want from the first day. Each step is saved as you go."
      />
      <OnboardingWizard
        initial={{
          me: {
            email: me.email,
            firstName: me.firstName ?? "",
            lastName: me.lastName ?? "",
            phone: me.phone ?? "",
          },
          academy: {
            slug: tenant.slug,
            name: tenant.name,
            tagline: settings.tagline ?? "",
            companyEmail: tenant.companyEmail ?? "",
            companyPhone: tenant.companyPhone ?? "",
            website: tenant.website ?? "",
            addressLine1: tenant.addressLine1 ?? "",
            city: tenant.city ?? "",
            region: tenant.region ?? "",
            country: tenant.country ?? "",
          },
          region: {
            timezone: settings.timezone,
            locale: settings.locale,
            currency: settings.currency,
          },
          brand: {
            primaryColor: settings.primaryColor,
            themePreset: settings.themePreset,
            themePrimaryOverride: settings.themePrimaryOverride,
            logoUrl,
          },
          completedSteps: settings.onboarding?.completedSteps ?? [],
          courseCount,
          subaccount: tenant.subaccount
            ? {
                businessName: tenant.subaccount.businessName,
                settlementBankCode: tenant.subaccount.settlementBankCode,
                settlementAccountNumber: tenant.subaccount.settlementAccountNumber,
              }
            : null,
        }}
        options={{
          timezones: getTimezoneOptions(),
          locales: getLocaleOptions(env.SUPPORTED_LOCALES),
          currencies: getCurrencyOptions(),
          countries: getCountryOptions(),
        }}
        storageEnabled={storageEnabled}
        canWriteBilling={hasPermission(actor, PERMISSIONS.TENANT_BILLING_WRITE.key)}
        canWriteCourses={hasPermission(actor, PERMISSIONS.TENANT_COURSES_WRITE.key)}
      />
    </div>
  );
}
