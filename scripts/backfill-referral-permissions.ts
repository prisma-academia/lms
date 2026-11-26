/**
 * Give existing academies the two referral permissions.
 *
 * `tenant.referrals:read` (see every staff member's code and results) and
 * `tenant.referrals:write` (switch codes on and off) were added after most
 * academies were created. A new academy gets them through its built-in role
 * templates; an existing one has templates that were written out when it was
 * set up, and they do not have the keys. Until they do, an "Admin" a tenant
 * creates today cannot manage referrals, and nobody can see why.
 *
 * What this changes:
 *
 *  - The BUILT-IN role templates of every academy (`isSystem`, scope TENANT),
 *    brought up to what `TENANT_BUILTIN_ROLES` says today for these two keys:
 *    Owner and Admin gain both, Read-only gains the read key. Instructor and
 *    Staff are not given either, exactly as for a new academy.
 *  - The permission catalogue rows for the two keys.
 *  - With `--users`: staff who already hold every OTHER permission of the
 *    built-in Admin role — i.e. people who were made admins before the keys
 *    existed — gain both. A role template is only a starting point; applying
 *    one copies its permissions onto the person, so updating the template does
 *    nothing for people who already have it.
 *
 * What it never touches: templates an academy made itself, anybody with a
 * narrower set of permissions, and owners (an owner passes every permission
 * check without holding any).
 *
 * Adds only; running it twice changes nothing the second time.
 *
 *   npm run backfill:referral-permissions                 # dry run: prints what would change
 *   npm run backfill:referral-permissions -- --apply      # write it
 *   npm run backfill:referral-permissions -- --apply --users
 */
import "dotenv/config";
import { rawPrisma as prisma } from "../lib/db/raw-client";
import { PERMISSIONS, TENANT_BUILTIN_ROLES } from "../lib/auth/permissions";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const includeUsers = args.includes("--users");

const REFERRAL_KEYS: string[] = [PERMISSIONS.TENANT_REFERRALS_READ.key, PERMISSIONS.TENANT_REFERRALS_WRITE.key];

/** For each built-in role, the referral keys it is defined to hold today. */
const KEYS_BY_ROLE = new Map<string, string[]>(
  TENANT_BUILTIN_ROLES.map((role) => [
    role.name,
    REFERRAL_KEYS.filter((key) => (role.permissions as readonly string[]).includes(key)),
  ])
);

/** Everything the built-in Admin role holds apart from the keys being added. */
const ADMIN_WITHOUT_REFERRALS = (
  TENANT_BUILTIN_ROLES.find((role) => role.name === "Admin")!.permissions as readonly string[]
).filter((key) => !REFERRAL_KEYS.includes(key));

function missing(held: readonly string[], wanted: readonly string[]): string[] {
  return wanted.filter((key) => !held.includes(key));
}

async function main() {
  console.log(apply ? "Applying.\n" : "Dry run — nothing is written. Pass --apply to write.\n");

  /* ---- Built-in role templates ---- */

  const templates = await prisma.roleTemplate.findMany({
    where: { scope: "TENANT", isSystem: true, tenantId: { not: null } },
    select: { id: true, name: true, permissions: true, tenant: { select: { slug: true } } },
    orderBy: [{ tenantId: "asc" }, { name: "asc" }],
  });

  let templatesChanged = 0;
  let templatesAlready = 0;
  for (const template of templates) {
    const wanted = KEYS_BY_ROLE.get(template.name) ?? [];
    if (wanted.length === 0) continue;
    const add = missing(template.permissions, wanted);
    if (add.length === 0) {
      templatesAlready++;
      continue;
    }
    templatesChanged++;
    console.log(`  [${template.tenant?.slug ?? "?"}] role "${template.name}": + ${add.join(", ")}`);
    if (apply) {
      await prisma.roleTemplate.update({
        where: { id: template.id },
        data: { permissions: [...template.permissions, ...add] },
      });
    }
  }

  const custom = await prisma.roleTemplate.count({ where: { scope: "TENANT", isSystem: false } });

  /* ---- Staff who were already admins ---- */

  const staff = await prisma.tenantUser.findMany({
    where: { isOwner: false, permissions: { hasEvery: ADMIN_WITHOUT_REFERRALS } },
    select: { id: true, permissions: true, tenant: { select: { slug: true } } },
  });
  const staffToChange = staff
    .map((user) => ({ user, add: missing(user.permissions, REFERRAL_KEYS) }))
    .filter((entry) => entry.add.length > 0);

  for (const { user, add } of staffToChange) {
    // By id, not by name or email: this output may end up in a log.
    console.log(`  [${user.tenant.slug}] staff ${user.id}${includeUsers ? "" : " (not changed without --users)"}: + ${add.join(", ")}`);
    if (apply && includeUsers) {
      await prisma.tenantUser.update({
        where: { id: user.id },
        data: { permissions: [...user.permissions, ...add] },
      });
    }
  }

  /* ---- Permission catalogue ---- */

  let catalogueAdded = 0;
  for (const def of [PERMISSIONS.TENANT_REFERRALS_READ, PERMISSIONS.TENANT_REFERRALS_WRITE]) {
    const existing = await prisma.permission.findUnique({ where: { key: def.key }, select: { key: true } });
    if (existing) continue;
    catalogueAdded++;
    console.log(`  permission catalogue: + ${def.key}`);
    if (apply) {
      await prisma.permission.create({
        data: { key: def.key, module: def.module, description: def.description },
      });
    }
  }

  const verb = apply ? "updated" : "to update";
  console.log(
    [
      "",
      `Built-in role templates ${verb}: ${templatesChanged} (already had the keys: ${templatesAlready}).`,
      `Custom role templates left alone: ${custom}.`,
      includeUsers
        ? `Staff with full admin permissions ${verb}: ${staffToChange.length}.`
        : `Staff with full admin permissions who lack the keys: ${staffToChange.length} — not changed (pass --users to include them).`,
      `Permission catalogue rows ${apply ? "added" : "to add"}: ${catalogueAdded}.`,
    ].join("\n")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
