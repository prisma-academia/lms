import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import argon2 from "argon2";
import "dotenv/config";

import { ALL_PERMISSIONS, ALL_PLATFORM_PERMISSION_KEYS } from "../lib/auth/permissions";
import { tenantSettingsSchema } from "../lib/tenant/settings";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const GB = BigInt(1024 ** 3);

const SUBSCRIPTION_PLANS = [
  {
    code: "trial",
    name: "Trial",
    priceMonthlyCents: 0,
    storageQuotaBytes: BigInt(10) * GB,
    maxLearners: 50,
    maxInstructors: 5,
    maxCourses: 10,
    isPublic: false,
    sortOrder: 0,
  },
  {
    code: "starter",
    name: "Starter",
    priceMonthlyCents: 2_900_000,
    storageQuotaBytes: BigInt(50) * GB,
    maxLearners: 500,
    maxInstructors: 10,
    maxCourses: 50,
    isPublic: true,
    sortOrder: 1,
  },
  {
    code: "growth",
    name: "Growth",
    priceMonthlyCents: 7_900_000,
    storageQuotaBytes: BigInt(200) * GB,
    maxLearners: 5000,
    maxInstructors: 50,
    maxCourses: 500,
    isPublic: true,
    sortOrder: 2,
  },
  {
    code: "enterprise",
    name: "Enterprise",
    priceMonthlyCents: 0,
    storageQuotaBytes: BigInt(1024) * GB,
    maxLearners: null,
    maxInstructors: null,
    maxCourses: null,
    isPublic: true,
    sortOrder: 3,
  },
] as const;

async function main() {
  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL;
  const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error("PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD are required.");
  }

  for (const p of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { module: p.module, description: p.description },
      create: p,
    });
  }

  for (const plan of SUBSCRIPTION_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        priceMonthlyCents: plan.priceMonthlyCents,
        storageQuotaBytes: plan.storageQuotaBytes,
        maxLearners: plan.maxLearners,
        maxInstructors: plan.maxInstructors,
        maxCourses: plan.maxCourses,
        isPublic: plan.isPublic,
        sortOrder: plan.sortOrder,
      },
      create: { ...plan, currency: "NGN" },
    });
  }

  await prisma.platformConfig.upsert({
    where: { key: "default_tenant_settings" },
    update: {},
    create: {
      key: "default_tenant_settings",
      valueJson: tenantSettingsSchema.parse({}) as object,
    },
  });

  await ensurePlatformRole("Platform Super Admin", ALL_PLATFORM_PERMISSION_KEYS);
  await ensurePlatformRole(
    "Platform Read-only",
    ALL_PLATFORM_PERMISSION_KEYS.filter((k) => k.endsWith(":read"))
  );

  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });

  await prisma.platformUser.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {
      isSuperAdmin: true,
      permissions: ALL_PLATFORM_PERMISSION_KEYS,
    },
    create: {
      email: adminEmail.toLowerCase(),
      firstName: "Super",
      lastName: "Admin",
      passwordHash,
      mustChangePassword: true,
      isSuperAdmin: true,
      permissions: ALL_PLATFORM_PERMISSION_KEYS,
    },
  });

  // Grandfather existing tenants without trial disruption
  await prisma.tenant.updateMany({
    where: { plan: "TRIAL", trialEndsAt: null },
    data: {
      plan: "ACTIVE",
      subscriptionStatus: "ACTIVE",
    },
  });

  console.log(`Seed complete. Super admin: ${adminEmail.toLowerCase()}`);
}

async function ensurePlatformRole(name: string, permissions: string[]) {
  const existing = await prisma.roleTemplate.findFirst({
    where: { scope: "PLATFORM", tenantId: null, name },
  });
  if (existing) {
    return prisma.roleTemplate.update({
      where: { id: existing.id },
      data: { permissions, isSystem: true },
    });
  }
  return prisma.roleTemplate.create({
    data: { scope: "PLATFORM", name, permissions, isSystem: true },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
