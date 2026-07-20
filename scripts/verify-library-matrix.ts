/**
 * End-to-end access matrix against the real database.
 *
 * Creates one item per access state, then asks libraryAccessWhere which ones a
 * learner can see. Every row is cleaned up afterwards.
 */
import { rawPrisma } from "../lib/db/raw-client";
import { runWithContext } from "../lib/db/tenant-context";
import { prisma } from "../lib/db/client";
import { loadLibraryPrincipals, accessibleFolderIds, libraryAccessWhere, resolveItemAccess } from "../lib/library/access";
import type { ClientActor } from "../lib/auth/permissions";

let failed = 0;
function check(label: string, actual: boolean, expected: boolean) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} (visible=${actual}, want ${expected})`);
}

async function main() {
  // Pick a learner that actually has enrollments, so the course/programme
  // branches are exercised rather than skipped.
  const client =
    (await rawPrisma.client.findFirst({
      where: { enrollments: { some: {} } },
      select: { id: true, tenantId: true, email: true },
    })) ??
    (await rawPrisma.client.findFirst({ select: { id: true, tenantId: true, email: true } }));
  if (!client) return console.log("need a client to test");
  const tenant = { id: client.tenantId };

  // Fixtures so the negative cases actually run rather than being skipped.
  const other =
    (await rawPrisma.client.findFirst({
      where: { tenantId: tenant.id, id: { not: client.id } },
      select: { id: true },
    })) ??
    (await rawPrisma.client.create({
      data: { tenantId: tenant.id, email: `_t_other_${Date.now()}@test.invalid` },
      select: { id: true },
    }));

  // A group our learner is NOT in — assignment to it must not leak.
  const foreignGroup = await rawPrisma.clientGroup.create({
    data: { tenantId: tenant.id, name: `_t_foreign_group_${Date.now()}` },
    select: { id: true },
  });

  // A different tenant entirely, for the isolation check.
  const otherTenant = await rawPrisma.tenant.findFirst({
    where: { id: { not: tenant.id } },
    select: { id: true },
  });

  const groupIds = (
    await rawPrisma.clientGroupMembership.findMany({ where: { clientId: client.id }, select: { groupId: true } })
  ).map((g) => g.groupId);
  const courseIds = (
    await rawPrisma.enrollment.findMany({ where: { clientId: client.id }, select: { courseId: true } })
  ).map((e) => e.courseId);
  const progIds = (
    await rawPrisma.programmeEnrollment.findMany({ where: { clientId: client.id }, select: { programmeId: true } })
  ).map((p) => p.programmeId);

  console.log(`learner ${client.email}: ${groupIds.length} groups, ${courseIds.length} courses, ${progIds.length} programmes\n`);

  // Deep folder chain: granted -> child -> grandchild
  const f1 = await rawPrisma.libraryFolder.create({ data: { tenantId: tenant.id, name: "_t_granted" } });
  const f2 = await rawPrisma.libraryFolder.create({ data: { tenantId: tenant.id, name: "_t_child", parentId: f1.id } });
  const f3 = await rawPrisma.libraryFolder.create({ data: { tenantId: tenant.id, name: "_t_grand", parentId: f2.id } });
  const fUngranted = await rawPrisma.libraryFolder.create({ data: { tenantId: tenant.id, name: "_t_ungranted" } });

  const mk = async (label: string, extra: Record<string, unknown> = {}) =>
    rawPrisma.libraryItem.create({
      data: {
        tenantId: tenant.id,
        name: label,
        key: `tenants/${tenant.id}/library/_t_${label}_${Math.random().toString(36).slice(2)}.pdf`,
        contentType: "application/pdf",
        mediaKind: "PDF",
        ...extra,
      },
    });

  const items = {
    public: await mk("public", { isPublic: true, isFree: true }),
    privateUnassigned: await mk("private-unassigned"),
    assignedToMe: await mk("assigned-to-me"),
    assignedToOther: await mk("assigned-to-other"),
    assignedToGroup: await mk("assigned-to-group"),
    assignedToCourse: await mk("assigned-to-course"),
    assignedToProgramme: await mk("assigned-to-programme"),
    assignedToAll: await mk("assigned-to-all"),
    inGrantedFolderDeep: await mk("in-granted-folder-3-levels", { folderId: f3.id }),
    inUngrantedFolder: await mk("in-ungranted-folder", { folderId: fUngranted.id }),
    paidUnowned: await mk("paid-unowned", { isPublic: true, isFree: false, priceCents: 5000, currency: "NGN" }),
    paidOwned: await mk("paid-owned", { isPublic: true, isFree: false, priceCents: 5000, currency: "NGN" }),
    expiredGrant: await mk("expired-grant"),
    futureGrant: await mk("future-grant"),
    assignedToForeignGroup: await mk("assigned-to-foreign-group"),
  };

  // Item belonging to a DIFFERENT tenant, granted to everyone there.
  const foreignItem = otherTenant
    ? await rawPrisma.libraryItem.create({
        data: {
          tenantId: otherTenant.id,
          name: "_t_other_tenant_item",
          key: `tenants/${otherTenant.id}/library/_t_${Math.random().toString(36).slice(2)}.pdf`,
          contentType: "application/pdf",
          mediaKind: "PDF",
          isPublic: true,
          isFree: true,
        },
      })
    : null;

  const g = async (itemId: string, subjectType: string, subjectId: string | null, extra: Record<string, unknown> = {}) =>
    rawPrisma.libraryGrant.create({
      data: {
        tenantId: tenant.id,
        itemId,
        targetKey: `I:${itemId}`,
        subjectType: subjectType as never,
        subjectKey: subjectId ? `${subjectType}:${subjectId}` : "ALL",
        ...(subjectType === "CLIENT" ? { clientId: subjectId } : {}),
        ...(subjectType === "CLIENT_GROUP" ? { clientGroupId: subjectId } : {}),
        ...(subjectType === "COURSE" ? { courseId: subjectId } : {}),
        ...(subjectType === "PROGRAMME" ? { programmeId: subjectId } : {}),
        ...extra,
      } as never,
    });

  await g(items.assignedToMe.id, "CLIENT", client.id);
  await g(items.assignedToOther.id, "CLIENT", other.id);
  await g(items.assignedToForeignGroup.id, "CLIENT_GROUP", foreignGroup.id);
  if (groupIds[0]) await g(items.assignedToGroup.id, "CLIENT_GROUP", groupIds[0]);
  if (courseIds[0]) await g(items.assignedToCourse.id, "COURSE", courseIds[0]);
  if (progIds[0]) await g(items.assignedToProgramme.id, "PROGRAMME", progIds[0]);
  await g(items.assignedToAll.id, "ALL_CLIENTS", null);
  await g(items.expiredGrant.id, "CLIENT", client.id, { expiresAt: new Date(Date.now() - 60_000) });
  await g(items.futureGrant.id, "CLIENT", client.id, { startsAt: new Date(Date.now() + 3_600_000) });

  // Folder grant on the TOP folder only; the item lives 3 levels down.
  await rawPrisma.libraryGrant.create({
    data: {
      tenantId: tenant.id,
      folderId: f1.id,
      targetKey: `F:${f1.id}`,
      subjectType: "ALL_CLIENTS",
      subjectKey: "ALL",
    },
  });

  await rawPrisma.libraryEntitlement.create({
    data: { tenantId: tenant.id, itemId: items.paidOwned.id, clientId: client.id, source: "MANUAL" },
  });

  const actor: ClientActor = { kind: "client", clientId: client.id, tenantId: tenant.id };

  await runWithContext({ mode: "tenant-client", tenantId: tenant.id }, async () => {
    const p = await loadLibraryPrincipals(actor);
    const folderIds = await accessibleFolderIds(p);
    const visible = await prisma.libraryItem.findMany({
      where: { AND: [libraryAccessWhere(p, folderIds), { name: { startsWith: "" } }] },
      select: { id: true, name: true },
    });
    const visibleIds = new Set(visible.map((v) => v.id));
    const can = (i: { id: string }) => visibleIds.has(i.id);

    console.log("list visibility:");
    check("public item", can(items.public), true);
    check("private, unassigned", can(items.privateUnassigned), false);
    check("assigned to me", can(items.assignedToMe), true);
    check("assigned to a DIFFERENT learner", can(items.assignedToOther), false);
    check("assigned to a group I am NOT in", can(items.assignedToForeignGroup), false);
    if (groupIds[0]) check("assigned to my group", can(items.assignedToGroup), true);
    if (courseIds[0]) check("assigned to my course", can(items.assignedToCourse), true);
    if (progIds[0]) check("assigned to my programme", can(items.assignedToProgramme), true);
    check("assigned to everyone", can(items.assignedToAll), true);
    check("in granted folder, 3 levels deep", can(items.inGrantedFolderDeep), true);
    check("in an ungranted folder", can(items.inUngrantedFolder), false);
    check("paid, not owned (listed publicly)", can(items.paidUnowned), true);
    check("paid, owned via entitlement", can(items.paidOwned), true);
    check("grant that already expired", can(items.expiredGrant), false);
    check("grant that has not started", can(items.futureGrant), false);

    console.log("\nper-item resolution:");
    const paidUnowned = await resolveItemAccess(actor, items.paidUnowned.id);
    check("paid unowned -> denied", paidUnowned.allowed, false);
    if (!paidUnowned.allowed) {
      check("  ...and marked purchasable", paidUnowned.purchasable, true);
    }
    const paidOwned = await resolveItemAccess(actor, items.paidOwned.id);
    check("paid owned -> allowed", paidOwned.allowed, true);
    const priv = await resolveItemAccess(actor, items.privateUnassigned.id);
    check("private unassigned -> denied", priv.allowed, false);
    if (!priv.allowed) check("  ...and NOT purchasable", priv.purchasable, false);
    const deep = await resolveItemAccess(actor, items.inGrantedFolderDeep.id);
    check("deep folder item -> allowed", deep.allowed, true);

    if (foreignItem) {
      console.log("\ntenant isolation:");
      check("public item in ANOTHER tenant is invisible", can(foreignItem), false);
      const foreign = await resolveItemAccess(actor, foreignItem.id);
      check("...and resolves as denied by id", foreign.allowed, false);
    }
  });

  // cleanup
  const ids = Object.values(items).map((i) => i.id);
  if (foreignItem) ids.push(foreignItem.id);
  await rawPrisma.libraryGrant.deleteMany({ where: { OR: [{ itemId: { in: ids } }, { folderId: f1.id }] } });
  await rawPrisma.libraryEntitlement.deleteMany({ where: { itemId: { in: ids } } });
  await rawPrisma.libraryItem.deleteMany({ where: { id: { in: ids } } });
  await rawPrisma.libraryFolder.deleteMany({ where: { id: { in: [f3.id, f2.id, f1.id, fUngranted.id] } } });
  await rawPrisma.clientGroup.deleteMany({ where: { id: foreignGroup.id } });
  await rawPrisma.client.deleteMany({ where: { email: { startsWith: "_t_other_" } } });
  console.log("\ncleaned up test rows.");

  console.log(failed === 0 ? "All access-matrix checks passed." : `${failed} check(s) FAILED.`);
  await rawPrisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
