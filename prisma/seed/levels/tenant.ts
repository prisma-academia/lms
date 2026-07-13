import { tenantSettingsSchema, MODULE_KEYS } from "../../../lib/tenant/settings";
import { TENANT_BUILTIN_ROLES } from "../../../lib/auth/permissions";
import { DAY, SLUG, type SeedContext } from "../index";
import { NG_LOCALE } from "../components/locale/ng";

const GB = BigInt(1024 ** 3);

/**
 * Ensure the "growth" subscription plan exists. The demo seed runs
 * independently of the platform `seed.ts`, so we upsert the plan the demo tenant
 * subscribes to (matching the platform seed's definition).
 */
async function ensureGrowthPlan(prisma: SeedContext["prisma"]) {
  return prisma.subscriptionPlan.upsert({
    where: { code: "growth" },
    update: {},
    create: {
      code: "growth",
      name: "Growth",
      priceMonthlyCents: 7_900_000, // ₦79,000/mo
      currency: NG_LOCALE.currency,
      storageQuotaBytes: BigInt(200) * GB,
      maxLearners: 5000,
      maxInstructors: 50,
      maxCourses: 500,
      isPublic: true,
      sortOrder: 2,
    },
  });
}

export async function seedTenant(prisma: SeedContext["prisma"]): Promise<string> {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing) {
    await prisma.tenant.delete({ where: { id: existing.id } });
    console.log("  removed existing demo tenant");
  }

  const plan = await ensureGrowthPlan(prisma);

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
      // Active paid subscriber (Growth plan) — demonstrates the monetized system.
      plan: "ACTIVE",
      trialEndsAt: null,
      subscriptionStatus: "ACTIVE",
      subscriptionPlanId: plan.id,
      subscriptionEndsAt: new Date(Date.now() + 25 * DAY),
      billingProvider: "PAYSTACK",
      storageQuotaBytes: plan.storageQuotaBytes,
      settingsJson: settings as object,
      companyEmail: NG_LOCALE.companyEmail,
      companyPhone: NG_LOCALE.companyPhone,
      website: NG_LOCALE.website,
      addressLine1: NG_LOCALE.addressLine1,
      city: "Lagos",
      country: "NG",
    },
  });

  // Payout subaccount (Paystack) so paid course/programme sales are enabled.
  await prisma.tenantSubaccount.create({
    data: {
      tenantId: tenant.id,
      businessName: NG_LOCALE.tenantName,
      businessEmail: NG_LOCALE.companyEmail,
      businessPhone: NG_LOCALE.companyPhone,
      settlementBankCode: "058", // GTBank
      settlementAccountNumber: "0123456789",
      settlementAccountName: NG_LOCALE.tenantName,
      paystackSubaccountCode: "ACCT_demo0subaccount",
      paystackStatus: "ACTIVE",
      paystackProvisionedAt: new Date(),
      courseSalesEnabled: true,
      platformCommissionPct: 10,
      defaultProvider: "PAYSTACK",
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
