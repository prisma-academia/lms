import { tenantSettingsSchema, MODULE_KEYS } from "../../../lib/tenant/settings";
import { TENANT_BUILTIN_ROLES } from "../../../lib/auth/permissions";
import { DAY, SLUG, type SeedContext } from "../index";
import { NG_LOCALE } from "../components/locale/ng";

export async function seedTenant(prisma: SeedContext["prisma"]): Promise<string> {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing) {
    await prisma.tenant.delete({ where: { id: existing.id } });
    console.log("  removed existing demo tenant");
  }

  const settings = tenantSettingsSchema.parse({
    primaryColor: NG_LOCALE.primaryColor,
    currency: NG_LOCALE.currency,
    locale: NG_LOCALE.locale,
    timezone: NG_LOCALE.timezone,
    enabledModules: [...MODULE_KEYS],
    onboarding: {
      completedAt: new Date().toISOString(),
      completedSteps: ["seeded"],
    },
  });

  const tenant = await prisma.tenant.create({
    data: {
      slug: SLUG,
      name: NG_LOCALE.tenantName,
      status: "ACTIVE",
      plan: "TRIAL",
      trialEndsAt: new Date(Date.now() + 365 * DAY),
      subscriptionStatus: "NONE",
      settingsJson: settings as object,
      companyEmail: NG_LOCALE.companyEmail,
      companyPhone: NG_LOCALE.companyPhone,
      website: NG_LOCALE.website,
      addressLine1: NG_LOCALE.addressLine1,
      city: "Lagos",
      country: "NG",
    },
  });

  for (const r of TENANT_BUILTIN_ROLES) {
    await prisma.roleTemplate.create({
      data: {
        scope: "TENANT",
        tenantId: tenant.id,
        name: r.name,
        permissions: [...r.permissions],
        isSystem: true,
      },
    });
  }

  return tenant.id;
}
