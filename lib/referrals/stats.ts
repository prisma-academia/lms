import { prisma } from "@/lib/db/client";
import { inTenant } from "@/lib/referrals/codes";

/**
 * What a referral code has brought in. Read-only.
 *
 * Revenue is kept per currency: an academy can price one course in naira and
 * another in dollars, and adding the two would produce a number that means
 * nothing.
 */

export type ReferralTotals = {
  signups: number;
  enrollments: number;
  purchases: number;
  /** Sum of confirmed payments, smallest unit, one entry per currency. */
  revenue: { currency: string; amountCents: number }[];
};

export function emptyTotals(): ReferralTotals {
  return { signups: 0, enrollments: 0, purchases: 0, revenue: [] };
}

/** Totals for each of the given codes, keyed by code id. Codes with no events get zeros. */
export async function referralTotals(
  tenantId: string,
  codeIds: string[]
): Promise<Map<string, ReferralTotals>> {
  const totals = new Map<string, ReferralTotals>(codeIds.map((id) => [id, emptyTotals()]));
  if (codeIds.length === 0) return totals;

  const [counts, money] = await inTenant(tenantId, () =>
    Promise.all([
      prisma.referralEvent.groupBy({
        by: ["referralCodeId", "type"],
        where: { tenantId, referralCodeId: { in: codeIds } },
        _count: { _all: true },
      }),
      prisma.referralEvent.groupBy({
        by: ["referralCodeId", "currency"],
        where: { tenantId, referralCodeId: { in: codeIds }, type: "PURCHASE", amountCents: { not: null } },
        _sum: { amountCents: true },
      }),
    ])
  );

  for (const row of counts) {
    const entry = totals.get(row.referralCodeId);
    if (!entry) continue;
    if (row.type === "SIGNUP") entry.signups = row._count._all;
    else if (row.type === "ENROLLMENT") entry.enrollments = row._count._all;
    else if (row.type === "PURCHASE") entry.purchases = row._count._all;
  }
  for (const row of money) {
    const entry = totals.get(row.referralCodeId);
    if (!entry || !row.currency) continue;
    entry.revenue.push({ currency: row.currency, amountCents: row._sum.amountCents ?? 0 });
  }
  for (const entry of totals.values()) {
    entry.revenue.sort((a, b) => b.amountCents - a.amountCents);
  }
  return totals;
}

export type ReferredLearner = {
  id: string;
  name: string;
  email: string;
  referredAt: Date | null;
  enrollments: number;
  purchases: number;
};

/** The learners who signed up through a code, newest first. */
export async function referredLearners(
  tenantId: string,
  codeId: string,
  limit = 100
): Promise<ReferredLearner[]> {
  return inTenant(tenantId, async () => {
    const clients = await prisma.client.findMany({
      where: { tenantId, referralCodeId: codeId },
      orderBy: [{ referredAt: "desc" }, { id: "desc" }],
      take: limit,
      select: { id: true, email: true, firstName: true, lastName: true, referredAt: true },
    });
    if (clients.length === 0) return [];

    const activity = await prisma.referralEvent.groupBy({
      by: ["clientId", "type"],
      where: {
        tenantId,
        referralCodeId: codeId,
        clientId: { in: clients.map((c) => c.id) },
        type: { in: ["ENROLLMENT", "PURCHASE"] },
      },
      _count: { _all: true },
    });
    const count = (clientId: string, type: "ENROLLMENT" | "PURCHASE") =>
      activity.find((a) => a.clientId === clientId && a.type === type)?._count._all ?? 0;

    return clients.map((c) => ({
      id: c.id,
      name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim(),
      email: c.email,
      referredAt: c.referredAt,
      enrollments: count(c.id, "ENROLLMENT"),
      purchases: count(c.id, "PURCHASE"),
    }));
  });
}
