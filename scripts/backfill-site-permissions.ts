/**
 * Backfill tenant.site:read / tenant.site:write onto system Owner + Admin
 * role templates and matching tenant users.
 *
 * Usage: npx tsx scripts/backfill-site-permissions.ts
 */
import "dotenv/config";
import { rawPrisma as prisma } from "../lib/db/raw-client";

const SITE_PERMS = ["tenant.site:read", "tenant.site:write"] as const;

async function main() {
  const templates = await prisma.roleTemplate.findMany({
    where: {
      scope: "TENANT",
      isSystem: true,
      name: { in: ["Owner", "Admin"] },
    },
  });

  let templatesUpdated = 0;
  for (const t of templates) {
    const next = [...new Set([...t.permissions, ...SITE_PERMS])];
    if (next.length === t.permissions.length) continue;
    await prisma.roleTemplate.update({
      where: { id: t.id },
      data: { permissions: next },
    });
    templatesUpdated++;
  }

  const users = await prisma.tenantUser.findMany({
    where: {
      OR: [
        { isOwner: true },
        { permissions: { has: "tenant.settings:read" } },
        { permissions: { has: "tenant.users:write" } },
        { permissions: { has: "tenant.roles:read" } },
      ],
    },
    select: { id: true, permissions: true, isOwner: true },
  });

  let usersUpdated = 0;
  for (const u of users) {
    const shouldGrant =
      u.isOwner ||
      u.permissions.includes("tenant.settings:read") ||
      u.permissions.includes("tenant.settings:write") ||
      u.permissions.includes("tenant.users:write") ||
      u.permissions.includes("tenant.roles:read");
    if (!shouldGrant) continue;

    const next = [...new Set([...u.permissions, ...SITE_PERMS])];
    if (next.length === u.permissions.length) continue;
    await prisma.tenantUser.update({
      where: { id: u.id },
      data: { permissions: next },
    });
    usersUpdated++;
  }

  for (const key of SITE_PERMS) {
    await prisma.permission.upsert({
      where: { key },
      create: {
        key,
        module: "tenant.site",
        description:
          key === "tenant.site:read"
            ? "View landing / site pages"
            : "Edit landing / site pages",
      },
      update: {},
    });
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true, settingsJson: true } });
  let tenantsUpdated = 0;
  for (const t of tenants) {
    const raw =
      t.settingsJson && typeof t.settingsJson === "object"
        ? (t.settingsJson as Record<string, unknown>)
        : {};
    const modules = Array.isArray(raw.enabledModules)
      ? (raw.enabledModules as string[])
      : null;
    if (!modules || modules.includes("site")) continue;
    await prisma.tenant.update({
      where: { id: t.id },
      data: {
        settingsJson: { ...raw, enabledModules: [...modules, "site"] },
      },
    });
    tenantsUpdated++;
  }

  console.log(
    `Updated ${templatesUpdated} role templates, ${usersUpdated} users, ${tenantsUpdated} tenant module lists.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
