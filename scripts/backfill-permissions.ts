/**
 * Bring existing academies up to date with permissions added after they were
 * created. Generalises `backfill-referral-permissions.ts` to any key set.
 *
 * A new academy gets every key through `TENANT_BUILTIN_ROLES`. An existing one
 * has role templates written out when it was set up, which lack keys added
 * since. This script:
 *
 *  - adds to each BUILT-IN template (isSystem, scope TENANT) the keys from the
 *    chosen set that `TENANT_BUILTIN_ROLES` gives that role today;
 *  - creates built-in templates that did not exist yet (e.g. "Invigilator");
 *  - adds the permission catalogue rows;
 *  - with `--users`: gives the keys that Admin holds to staff who already hold
 *    every OTHER Admin permission (people made admins before the keys existed).
 *
 * Never touches custom templates, narrower staff, or owners. Adds only; a second
 * run changes nothing.
 *
 *   npm run backfill:permissions                              # dry run, exam keys
 *   npm run backfill:permissions -- --apply
 *   npm run backfill:permissions -- --apply --users
 *   npm run backfill:permissions -- --prefix tenant.developers --apply
 */
import "dotenv/config";
import { rawPrisma as prisma } from "../lib/db/raw-client";
import { ALL_PERMISSIONS, TENANT_BUILTIN_ROLES } from "../lib/auth/permissions";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const includeUsers = args.includes("--users");
const prefixArgs = args.flatMap((a, i) => (a === "--prefix" && args[i + 1] ? [args[i + 1]] : []));
const prefixes = prefixArgs.length > 0 ? prefixArgs : ["tenant.exams"];

const KEYS: string[] = ALL_PERMISSIONS.map((p) => p.key as string).filter((k) =>
  prefixes.some((p) => k.startsWith(p + ":"))
);

function missing(held: readonly string[], wanted: readonly string[]): string[] {
  return wanted.filter((key) => !held.includes(key));
}

async function main() {
  if (KEYS.length === 0) {
    console.log(`No permission keys match ${prefixes.join(", ")}.`);
    return;
  }
  console.log(apply ? "Applying.\n" : "Dry run — nothing is written. Pass --apply to write.\n");
  console.log(`Keys: ${KEYS.join(", ")}\n`);

  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  const templates = await prisma.roleTemplate.findMany({
    where: { scope: "TENANT", isSystem: true, tenantId: { not: null } },
    select: { id: true, name: true, permissions: true, tenantId: true },
  });

  let changed = 0;
  let created = 0;
  for (const tenant of tenants) {
    for (const role of TENANT_BUILTIN_ROLES) {
      const wanted = KEYS.filter((k) => (role.permissions as readonly string[]).includes(k));
      if (wanted.length === 0) continue;
      const template = templates.find((t) => t.tenantId === tenant.id && t.name === role.name);
      if (!template) {
        created++;
        console.log(`  [${tenant.slug}] create role "${role.name}"`);
        if (apply) {
          await prisma.roleTemplate.create({
            data: {
              tenantId: tenant.id,
              scope: "TENANT",
              name: role.name,
              permissions: [...role.permissions],
              isSystem: true,
            },
          });
        }
        continue;
      }
      const add = missing(template.permissions, wanted);
      if (add.length === 0) continue;
      changed++;
      console.log(`  [${tenant.slug}] role "${role.name}": + ${add.join(", ")}`);
      if (apply) {
        await prisma.roleTemplate.update({
          where: { id: template.id },
          data: { permissions: [...template.permissions, ...add] },
        });
      }
    }
  }

  const adminKeys = TENANT_BUILTIN_ROLES.find((r) => r.name === "Admin")!.permissions as readonly string[];
  const adminNew = KEYS.filter((k) => adminKeys.includes(k));
  const adminRest = adminKeys.filter((k) => !KEYS.includes(k));
  const staff = await prisma.tenantUser.findMany({
    where: { isOwner: false, permissions: { hasEvery: adminRest } },
    select: { id: true, permissions: true, tenant: { select: { slug: true } } },
  });
  const staffToChange = staff
    .map((user) => ({ user, add: missing(user.permissions, adminNew) }))
    .filter((entry) => entry.add.length > 0);
  for (const { user, add } of staffToChange) {
    console.log(`  [${user.tenant.slug}] staff ${user.id}${includeUsers ? "" : " (not changed without --users)"}: + ${add.join(", ")}`);
    if (apply && includeUsers) {
      await prisma.tenantUser.update({ where: { id: user.id }, data: { permissions: [...user.permissions, ...add] } });
    }
  }

  let catalogueAdded = 0;
  for (const def of ALL_PERMISSIONS.filter((p) => KEYS.includes(p.key))) {
    const existing = await prisma.permission.findUnique({ where: { key: def.key }, select: { key: true } });
    if (existing) continue;
    catalogueAdded++;
    console.log(`  permission catalogue: + ${def.key}`);
    if (apply) {
      await prisma.permission.create({ data: { key: def.key, module: def.module, description: def.description } });
    }
  }

  const verb = apply ? "" : " (dry run)";
  console.log(
    `\nTemplates updated: ${changed}, created: ${created}, staff: ${includeUsers ? staffToChange.length : 0} of ${staffToChange.length}, catalogue rows: ${catalogueAdded}${verb}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
