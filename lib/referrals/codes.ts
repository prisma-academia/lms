import { prisma } from "@/lib/db/client";
import { runWithContext } from "@/lib/db/tenant-context";
import { generateReferralCode } from "@/lib/referrals/code-format";

/**
 * A staff member's referral code.
 *
 * One per staff member, unique within the academy, created the first time they
 * ask for it. Codes are never edited or reissued: a link that has been shared
 * has to keep meaning the same person. Switching one off (`active: false`)
 * stops it earning credit without breaking the links that carry it.
 */

export type StaffReferralCode = {
  id: string;
  code: string;
  active: boolean;
};

/** Bind the academy explicitly, so this works the same from a page, a route or a script. */
export function inTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return Promise.resolve(runWithContext({ mode: "tenant-admin", tenantId }, fn));
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

export async function getReferralCode(
  tenantId: string,
  tenantUserId: string
): Promise<StaffReferralCode | null> {
  return inTenant(tenantId, () =>
    prisma.referralCode.findFirst({
      where: { tenantId, tenantUserId },
      select: { id: true, code: true, active: true },
    })
  );
}

/**
 * The staff member's code, creating it if they do not have one yet.
 *
 * Safe to call twice at once: the second caller loses the race on the
 * one-per-person constraint and is handed the winner's code.
 */
export async function ensureReferralCode(
  tenantId: string,
  tenantUserId: string
): Promise<StaffReferralCode> {
  return inTenant(tenantId, async () => {
    const select = { id: true, code: true, active: true } as const;

    const existing = await prisma.referralCode.findFirst({
      where: { tenantId, tenantUserId },
      select,
    });
    if (existing) return existing;

    const user = await prisma.tenantUser.findFirst({
      where: { id: tenantUserId, tenantId },
      select: { firstName: true, lastName: true },
    });
    if (!user) throw new Error("Staff member not found in this academy.");

    // A collision on the code is possible but rare (31^4 for the same name
    // prefix); a collision on the person means someone else just created it.
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        return await prisma.referralCode.create({
          data: {
            tenantId,
            tenantUserId,
            code: generateReferralCode(user.firstName ?? user.lastName),
          },
          select,
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const raced = await prisma.referralCode.findFirst({
          where: { tenantId, tenantUserId },
          select,
        });
        if (raced) return raced;
      }
    }
    throw new Error("Could not generate a unique referral code. Try again.");
  });
}
