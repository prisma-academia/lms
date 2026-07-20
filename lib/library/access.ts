import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ClientActor } from "@/lib/auth/permissions";

/**
 * Who can see which library item.
 *
 * Access is `public OR entitlement OR grant`. Price does NOT gate a grant:
 * `isFree`/`priceCents` only decide whether an item the learner *cannot* reach
 * shows a purchase CTA. That keeps "instructor assigned this paid video to a
 * cohort" working without having to mint fake entitlements.
 *
 * Everything is expressed as a Prisma `where` so it composes with list queries
 * and stays a single indexed round trip. Raw SQL is not an option: the tenant
 * guard extension bans it on this client.
 */

export type LibraryPrincipals = {
  tenantId: string;
  clientId: string;
  clientGroupIds: string[];
  courseIds: string[];
  programmeIds: string[];
};

export async function loadLibraryPrincipals(actor: ClientActor): Promise<LibraryPrincipals> {
  const [groups, enrollments, programmes] = await Promise.all([
    prisma.clientGroupMembership.findMany({
      where: { clientId: actor.clientId },
      select: { groupId: true },
    }),
    prisma.enrollment.findMany({
      where: { clientId: actor.clientId },
      select: { courseId: true },
    }),
    // Programme membership is a first-class row (ProgrammeEnrollment); it is
    // not inferred from course enrollments, which cannot express it.
    prisma.programmeEnrollment.findMany({
      where: { clientId: actor.clientId },
      select: { programmeId: true },
    }),
  ]);

  return {
    tenantId: actor.tenantId,
    clientId: actor.clientId,
    clientGroupIds: groups.map((g) => g.groupId),
    courseIds: enrollments.map((e) => e.courseId),
    programmeIds: programmes.map((p) => p.programmeId),
  };
}

/** OR-branch matching any grant issued to this learner, by any route. */
function subjectFilter(p: LibraryPrincipals): Prisma.LibraryGrantWhereInput {
  const or: Prisma.LibraryGrantWhereInput[] = [
    { subjectType: "ALL_CLIENTS" },
    { subjectType: "CLIENT", clientId: p.clientId },
  ];
  // Empty `in: []` never matches, so the branch is dropped rather than emitted.
  if (p.clientGroupIds.length > 0) {
    or.push({ subjectType: "CLIENT_GROUP", clientGroupId: { in: p.clientGroupIds } });
  }
  if (p.courseIds.length > 0) {
    or.push({ subjectType: "COURSE", courseId: { in: p.courseIds } });
  }
  if (p.programmeIds.length > 0) {
    or.push({ subjectType: "PROGRAMME", programmeId: { in: p.programmeIds } });
  }
  return { OR: or };
}

/** Grants are only live inside their optional start/expiry window. */
function windowFilter(now: Date): Prisma.LibraryGrantWhereInput {
  return {
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ],
  };
}

/**
 * Folders this learner holds a grant on, plus every descendant.
 *
 * Expanded in JS from one flat read: `$queryRaw` is banned on the extended
 * client so a recursive CTE is unavailable, and folder trees are tens of rows,
 * not millions. A bug here under-grants (safe) or over-grants (not), so it is
 * unit-tested against a deep tree.
 */
export async function accessibleFolders(
  p: LibraryPrincipals,
  now = new Date()
): Promise<Map<string, boolean>> {
  const seedGrants = await prisma.libraryGrant.findMany({
    where: {
      folderId: { not: null },
      ...subjectFilter(p),
      ...windowFilter(now),
    },
    select: { folderId: true, canDownload: true },
  });
  if (seedGrants.length === 0) return new Map();

  const folders = await prisma.libraryFolder.findMany({ select: { id: true, parentId: true } });
  return expandFolderClosure(
    seedGrants.map((g) => ({ folderId: g.folderId!, canDownload: g.canDownload })),
    folders
  );
}

export async function accessibleFolderIds(p: LibraryPrincipals, now = new Date()): Promise<string[]> {
  return [...(await accessibleFolders(p, now)).keys()];
}

/**
 * Seed folders plus all descendants, carrying canDownload down the subtree.
 *
 * The map is keyed by folder id so a grant on an ANCESTOR still resolves for a
 * deeply nested item — looking only for a grant on the item's own folder would
 * silently deny access that was granted three levels up.
 *
 * Iterative and visits each id once, so a parent cycle cannot hang it. Where
 * two grants reach the same folder, the more permissive canDownload wins.
 * Exported for testing.
 */
export function expandFolderClosure(
  seeds: { folderId: string; canDownload: boolean }[],
  folders: { id: string; parentId: string | null }[]
): Map<string, boolean> {
  const childrenOf = new Map<string, string[]>();
  for (const f of folders) {
    if (!f.parentId) continue;
    const list = childrenOf.get(f.parentId);
    if (list) list.push(f.id);
    else childrenOf.set(f.parentId, [f.id]);
  }

  const out = new Map<string, boolean>();
  const stack = [...seeds];
  while (stack.length > 0) {
    const { folderId, canDownload } = stack.pop()!;
    const seen = out.get(folderId);
    if (seen !== undefined) {
      if (canDownload && !seen) out.set(folderId, true);
      continue;
    }
    out.set(folderId, canDownload);
    for (const kid of childrenOf.get(folderId) ?? []) {
      stack.push({ folderId: kid, canDownload });
    }
  }
  return out;
}

/** The reusable filter. Compose into any LibraryItem query for this learner. */
export function libraryAccessWhere(
  p: LibraryPrincipals,
  folderIds: string[],
  now = new Date()
): Prisma.LibraryItemWhereInput {
  const or: Prisma.LibraryItemWhereInput[] = [
    { isPublic: true },
    {
      entitlements: {
        some: {
          clientId: p.clientId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
    },
    { grants: { some: { ...subjectFilter(p), ...windowFilter(now) } } },
  ];
  if (folderIds.length > 0) {
    or.push({ folderId: { in: folderIds } });
  }
  return { OR: or };
}

export type AccessResult =
  | { allowed: true; via: "public" | "entitlement" | "grant"; canDownload: boolean }
  | {
      allowed: false;
      purchasable: boolean;
      priceCents: number | null;
      currency: string | null;
    };

/**
 * Single-item decision plus the reason, which drives the locked state: a paid
 * item the learner could buy gets a purchase CTA; one they simply were not
 * assigned gets "ask your instructor".
 */
export async function resolveItemAccess(actor: ClientActor, itemId: string): Promise<AccessResult> {
  const now = new Date();
  const p = await loadLibraryPrincipals(actor);

  const item = await prisma.libraryItem.findFirst({
    where: { id: itemId },
    select: { id: true, isPublic: true, isFree: true, priceCents: true, currency: true, folderId: true },
  });
  if (!item) {
    return { allowed: false, purchasable: false, priceCents: null, currency: null };
  }

  if (item.isPublic && item.isFree) {
    return { allowed: true, via: "public", canDownload: true };
  }

  const entitlement = await prisma.libraryEntitlement.findFirst({
    where: {
      itemId,
      clientId: p.clientId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true },
  });
  if (entitlement) return { allowed: true, via: "entitlement", canDownload: true };

  // A grant directly on the item.
  const direct = await prisma.libraryGrant.findFirst({
    where: { itemId, ...subjectFilter(p), ...windowFilter(now) },
    select: { canDownload: true },
    // A permissive grant should win over a restrictive one for the same item.
    orderBy: { canDownload: "desc" },
  });
  if (direct) return { allowed: true, via: "grant", canDownload: direct.canDownload };

  // Or a grant anywhere up the item's folder ancestry — the closure already
  // pushed each grant's canDownload down through its whole subtree.
  if (item.folderId) {
    const folders = await accessibleFolders(p, now);
    const viaFolder = folders.get(item.folderId);
    if (viaFolder !== undefined) {
      return { allowed: true, via: "grant", canDownload: viaFolder };
    }
  }

  return {
    allowed: false,
    // Only a priced item is buyable; a private free item just needs assigning.
    purchasable: !item.isFree && (item.priceCents ?? 0) > 0,
    priceCents: item.priceCents,
    currency: item.currency,
  };
}
