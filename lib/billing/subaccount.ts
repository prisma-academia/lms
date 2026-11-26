import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createMonnifySubaccount, listMonnifySubaccounts, MonnifyError } from "./monnify";
import { activeGateway } from "./providers";
import type { GatewayName } from "./types";
import { createPaystackSubaccount } from "./paystack";

export type ProvisionResult = {
  subaccount: Awaited<ReturnType<typeof prisma.tenantSubaccount.update>>;
  /** The gateway payouts were set up on, or null when none is configured. */
  gateway: GatewayName | null;
  /** Why payouts are not active, in words for the person who saved the form. Null when they are. */
  error: string | null;
};

/**
 * Make sure an academy has somewhere to be paid on the gateway in use.
 *
 * Idempotent: an academy that already has an ACTIVE sub-account is left alone.
 * A new one is created only when there is no code on file — which the settings
 * route arranges by clearing the code whenever the bank details change.
 *
 * Never throws for a gateway problem. The academy's details are already saved
 * by the time this runs; a failure here is reported, the status says FAILED,
 * and saving again retries.
 */
export async function provisionTenantSubaccounts(tenantId: string): Promise<ProvisionResult> {
  const row = await prisma.tenantSubaccount.findUnique({ where: { tenantId } });
  if (!row) throw new Error("Subaccount record not found.");

  const gateway = activeGateway();
  if (!gateway) {
    return {
      subaccount: row,
      gateway: null,
      error:
        "Your details are saved, but online payments are not set up on this platform yet, so payouts could not be activated.",
    };
  }

  // The payout account is registered with whichever gateway takes checkouts
  // (see `checkoutGatewayName`). The other gateways' columns are left as they are.
  if (gateway.name === "PAYSTACK") {
    if (row.paystackSubaccountCode && row.paystackStatus === "ACTIVE") {
      return { subaccount: row, gateway: "PAYSTACK", error: null };
    }
    try {
      const created = await createPaystackSubaccount({
        businessName: row.businessName,
        settlementBankCode: row.settlementBankCode,
        accountNumber: row.settlementAccountNumber,
        percentageCharge: row.platformCommissionPct ?? env.PLATFORM_COMMISSION_PCT,
        primaryContactEmail: row.businessEmail ?? undefined,
      });
      const subaccount = await prisma.tenantSubaccount.update({
        where: { tenantId },
        data: {
          paystackSubaccountCode: created.subaccount_code,
          paystackStatus: created.active ? "ACTIVE" : "PENDING",
          paystackProvisionedAt: new Date(),
          settlementAccountName: row.settlementAccountName ?? created.account_name,
        },
      });
      return { subaccount, gateway: "PAYSTACK", error: null };
    } catch (err) {
      logger.error({ tenantId, err }, "paystack_subaccount_failed");
      const subaccount = await prisma.tenantSubaccount.update({
        where: { tenantId },
        data: { paystackStatus: "FAILED" },
      });
      return {
        subaccount,
        gateway: "PAYSTACK",
        error: err instanceof Error && err.message ? err.message : "Paystack could not register the payout account.",
      };
    }
  }
  if (gateway.name !== "MONNIFY") {
    return { subaccount: row, gateway: gateway.name, error: null };
  }

  if (row.monnifySubaccountCode && row.monnifyStatus === "ACTIVE") {
    return { subaccount: row, gateway: "MONNIFY", error: null };
  }
  // A suspension is somebody's decision. Saving the form again must not undo it.
  if (row.monnifyStatus === "SUSPENDED") {
    return {
      subaccount: row,
      gateway: "MONNIFY",
      error: "Payouts for this academy have been suspended. Please contact support.",
    };
  }

  let code = row.monnifySubaccountCode;
  let accountName = row.settlementAccountName;
  let error: string | null = null;

  if (!code) {
    // Monnify requires an email on every sub-account; the business one is
    // optional on our form, so fall back to the academy owner's.
    const email =
      row.businessEmail ??
      (await prisma.tenantUser.findFirst({ where: { tenantId, isOwner: true }, select: { email: true } }))?.email ??
      null;

    const registered = await registerMonnifyPayoutAccount({
      bankCode: row.settlementBankCode,
      accountNumber: row.settlementAccountNumber,
      email,
      commissionPct: row.platformCommissionPct ?? env.PLATFORM_COMMISSION_PCT,
    });
    code = registered.code;
    accountName = accountName ?? registered.accountName;
    error = registered.error;
    if (error) logger.error({ tenantId, detail: error }, "monnify_subaccount_failed");
  }

  const subaccount = await prisma.tenantSubaccount.update({
    where: { tenantId },
    data: {
      monnifySubaccountCode: code,
      monnifyStatus: code ? "ACTIVE" : "FAILED",
      monnifyProvisionedAt: code ? (row.monnifyProvisionedAt ?? new Date()) : null,
      settlementAccountName: accountName,
      // `courseSalesEnabled` is deliberately not touched. It is the academy's
      // choice; whether a sale can actually go through is that choice AND an
      // ACTIVE payout account, checked at every checkout (`requireSaleSplit`).
    },
  });

  return { subaccount, gateway: "MONNIFY", error };
}

/**
 * Get a Monnify sub-account code for one bank account — by creating it, or by
 * recognising one that already exists. The gateway half of provisioning, kept
 * apart from the database half so it can be exercised on its own.
 *
 * Resolves, never rejects: `code` is set on success, `error` (words for the
 * person who saved the form) when there is none.
 */
export async function registerMonnifyPayoutAccount(input: {
  bankCode: string;
  accountNumber: string;
  email: string | null;
  /** The platform's cut. The sub-account is registered for the rest. */
  commissionPct: number;
}): Promise<{ code: string | null; accountName: string | null; error: string | null }> {
  if (!input.email) {
    return { code: null, accountName: null, error: "Add a business email so the payout account can be registered." };
  }
  try {
    const created = await createMonnifySubaccount({
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
      email: input.email,
      // The academy's share of each sale.
      splitPercentage: 100 - Math.min(100, Math.max(0, input.commissionPct)),
    });
    return { code: created.subAccountCode, accountName: created.accountName, error: null };
  } catch (err) {
    const adopted = await adoptExisting(input.bankCode, input.accountNumber, err);
    if (adopted) return { code: adopted.subAccountCode, accountName: adopted.accountName, error: null };
    return { code: null, accountName: null, error: explain(err) };
  }
}

/**
 * Creation failed. If that is because the account is ALREADY a sub-account of
 * this merchant — a previous attempt that Monnify completed but we never
 * recorded — use the existing one instead of failing forever.
 */
async function adoptExisting(bankCode: string, accountNumber: string, cause: unknown) {
  // Only a refusal is worth a second look; a timeout or an outage is not
  // evidence that anything exists.
  if (!(cause instanceof MonnifyError) || cause.kind !== "rejected") return null;
  try {
    const existing = await listMonnifySubaccounts();
    return existing.find((s) => s.accountNumber === accountNumber && s.bankCode === bankCode) ?? null;
  } catch {
    return null;
  }
}

function explain(err: unknown): string {
  if (err instanceof MonnifyError) {
    if (err.kind === "not_configured") return "Online payments are not set up on this platform yet.";
    if (err.retryable) return `${err.message} Your details are saved — save again to retry.`;
    if (err.kind === "auth") {
      return "Monnify did not accept the platform's API keys. Ask the platform administrator to check them.";
    }
    // Monnify's own words: usually the only thing that says what to fix
    // ("sub account feature not enabled", "invalid account number").
    return `Monnify could not register the payout account: ${err.message}`;
  }
  return "The payout account could not be registered. Your details are saved — save again to retry.";
}

export async function activateSubscription(tenantId: string, planId: string, provider: GatewayName) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error("Plan not found.");
  const endsAt = new Date();
  endsAt.setMonth(endsAt.getMonth() + 1);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      plan: "ACTIVE",
      subscriptionStatus: "ACTIVE",
      subscriptionPlanId: planId,
      subscriptionEndsAt: endsAt,
      storageQuotaBytes: plan.storageQuotaBytes,
      billingProvider: provider,
      status: "ACTIVE",
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Completing a purchase                                                       */
/* -------------------------------------------------------------------------- */

/**
 * What the three `complete…Purchase` functions share.
 *
 * Each does two things, in this order, and the order is the point:
 *
 *  1. CLAIM the payment — flip it to SUCCESS with a conditional update. Exactly
 *     one caller can win that, however many arrive together (the webhook and
 *     the customer's redirect usually land within a second of each other).
 *     `claimed` says whether this call was the one. Receipts, audit entries and
 *     anything else that must happen once hang off it.
 *  2. GRANT what was bought, with an upsert. This runs every time, claimed or
 *     not: if the process dies between the two steps, the gateway's retry finds
 *     the payment already SUCCESS — and must still be able to finish the job.
 *
 * The payment row must already exist: it is created when the checkout is
 * opened, and it is the proof that the reference is ours. Nothing is created
 * here on a gateway's say-so.
 */
type PurchaseInput = {
  tenantId: string;
  clientId: string;
  reference: string;
  /** Applied only where the row has none — the split agreed at checkout is the true one. */
  platformFeeCents?: number;
  tenantPayoutCents?: number;
  /** The gateway's own account of the payment, kept for reconciliation. */
  providerData?: object;
};

const claimData = (input: PurchaseInput) => ({
  status: "SUCCESS" as const,
  completedAt: new Date(),
  ...(input.providerData !== undefined ? { providerData: input.providerData } : {}),
});

const feeData = (input: PurchaseInput) => ({
  platformFeeCents: input.platformFeeCents ?? null,
  tenantPayoutCents: input.tenantPayoutCents ?? null,
});

/**
 * A payment that can still be marked paid. REFUNDED is deliberately absent: a
 * late or replayed "success" for a payment that has since been refunded must
 * not quietly hand the purchase back.
 */
export const CLAIMABLE = ["PENDING", "FAILED"] as const;
const unclaimed = (reference: string) => ({ externalRef: reference, status: { in: [...CLAIMABLE] } });
const withoutFees = (reference: string) => ({ externalRef: reference, platformFeeCents: null });

function missing(reference: string): never {
  throw new Error(`No pending payment for reference ${reference}.`);
}

/**
 * Run a grant upsert, and once more if it loses a race.
 *
 * The webhook and the customer's redirect routinely fulfil the same payment at
 * the same moment. Two upserts for a row that does not exist yet can both
 * decide to insert; the loser gets a unique-constraint error (P2002). By then
 * the row exists, so the second attempt takes the update path and succeeds —
 * instead of turning a paid purchase into a 500.
 */
async function grant<T>(upsert: () => Promise<T>): Promise<T> {
  try {
    return await upsert();
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "P2002") return upsert();
    throw err;
  }
}

export async function completeCoursePurchase(input: PurchaseInput & { courseId: string }) {
  const { count } = await prisma.coursePayment.updateMany({ where: unclaimed(input.reference), data: claimData(input) });
  await prisma.coursePayment.updateMany({ where: withoutFees(input.reference), data: feeData(input) });

  const payment = await prisma.coursePayment.findUnique({ where: { externalRef: input.reference } });
  if (!payment) missing(input.reference);

  const enrollment = await grant(() =>
    prisma.enrollment.upsert({
      where: { courseId_clientId: { courseId: input.courseId, clientId: input.clientId } },
      create: {
        tenantId: input.tenantId,
        courseId: input.courseId,
        clientId: input.clientId,
        paymentId: payment.id,
      },
      update: { paymentId: payment.id },
    })
  );

  return { payment, enrollment, claimed: count === 1 };
}

/** Fulfil a library item purchase: the payment, then the entitlement that unlocks the file. */
export async function completeLibraryPurchase(input: PurchaseInput & { itemId: string }) {
  const { count } = await prisma.libraryPayment.updateMany({ where: unclaimed(input.reference), data: claimData(input) });
  await prisma.libraryPayment.updateMany({ where: withoutFees(input.reference), data: feeData(input) });

  const payment = await prisma.libraryPayment.findUnique({ where: { externalRef: input.reference } });
  if (!payment) missing(input.reference);

  const entitlement = await grant(() =>
    prisma.libraryEntitlement.upsert({
      where: { itemId_clientId: { itemId: input.itemId, clientId: input.clientId } },
      create: {
        tenantId: input.tenantId,
        itemId: input.itemId,
        clientId: input.clientId,
        source: "PURCHASE",
        paymentId: payment.id,
      },
      update: { paymentId: payment.id },
    })
  );

  return { payment, entitlement, claimed: count === 1 };
}

export async function completeProgrammePurchase(input: PurchaseInput & { programmeId: string }) {
  const { count } = await prisma.programmePayment.updateMany({ where: unclaimed(input.reference), data: claimData(input) });
  await prisma.programmePayment.updateMany({ where: withoutFees(input.reference), data: feeData(input) });

  const payment = await prisma.programmePayment.findUnique({ where: { externalRef: input.reference } });
  if (!payment) missing(input.reference);

  // Enroll the learner into every published course in the programme.
  const links = await prisma.programmeCourse.findMany({
    where: { programmeId: input.programmeId },
    include: { course: { select: { id: true, status: true } } },
  });
  let enrolled = 0;
  for (const link of links) {
    if (link.course.status !== "PUBLISHED") continue;
    await grant(() =>
      prisma.enrollment.upsert({
        where: { courseId_clientId: { courseId: link.courseId, clientId: input.clientId } },
        create: { tenantId: input.tenantId, courseId: link.courseId, clientId: input.clientId },
        update: {},
      })
    );
    enrolled += 1;
  }

  // Programme-level membership, linked to the payment that bought it. Course
  // enrollments alone cannot express this, and library items assigned to a
  // programme resolve their audience through here.
  await grant(() =>
    prisma.programmeEnrollment.upsert({
      where: { programmeId_clientId: { programmeId: input.programmeId, clientId: input.clientId } },
      create: {
        tenantId: input.tenantId,
        programmeId: input.programmeId,
        clientId: input.clientId,
        paymentId: payment.id,
      },
      update: { paymentId: payment.id },
    })
  );

  return { payment, enrolled, claimed: count === 1 };
}
