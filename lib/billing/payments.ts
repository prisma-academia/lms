import { prisma } from "@/lib/db/client";
import { rawPrisma } from "@/lib/db/raw-client";
import type { PaymentProvider, PaymentStatus } from "@/lib/generated/prisma/enums";
import type { PaymentMetadata } from "./types";

/**
 * Our own record of a payment, whichever table it lives in.
 *
 * Four tables hold online payments (subscriptions, courses, programmes, library
 * items). A gateway only ever gives us back a reference, so everything that
 * confirms a payment starts by asking "whose is this?". That used to be three
 * hand-written lookups in the verify route — which is how library purchases
 * came to be left out and never confirmed from the redirect.
 */
export type PaymentRecord = {
  kind: PaymentMetadata["type"];
  id: string;
  tenantId: string;
  reference: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  /** What WE asked for, in minor units. The yardstick a paid amount is held to. */
  amountCents: number;
  currency: string;
  /** What was bought and by whom — from our row, never from the gateway. */
  metadata: PaymentMetadata;
};

const COMMON = {
  id: true,
  tenantId: true,
  provider: true,
  status: true,
  amountCents: true,
  currency: true,
} as const;

/**
 * Find the payment a reference belongs to.
 *
 * `anyTenant` is for the gateway webhook only. A webhook arrives with no
 * session and on whatever host the gateway was told to call, so there is no
 * tenant to scope the lookup to; the reference itself — 96 random bits that we
 * generated and only the payer's browser and the gateway have seen — is what
 * identifies the row. That is the one case the unscoped client exists for.
 *
 * Everywhere else the lookup runs under the caller's own tenant scope, so a
 * signed-in user cannot probe another academy's references.
 */
export async function findPaymentByReference(
  reference: string,
  opts: { anyTenant?: boolean } = {}
): Promise<PaymentRecord | null> {
  if (!reference) return null;
  const where = { externalRef: reference };

  // Written out twice because the scoped and unscoped clients are different
  // types to the compiler; the queries themselves are identical.
  const [platform, course, programme, library] = opts.anyTenant
    ? await Promise.all([
        rawPrisma.platformPayment.findUnique({ where, select: { ...COMMON, planId: true } }),
        rawPrisma.coursePayment.findUnique({ where, select: { ...COMMON, courseId: true, clientId: true } }),
        rawPrisma.programmePayment.findUnique({ where, select: { ...COMMON, programmeId: true, clientId: true } }),
        rawPrisma.libraryPayment.findUnique({ where, select: { ...COMMON, itemId: true, clientId: true } }),
      ])
    : await Promise.all([
        prisma.platformPayment.findUnique({ where, select: { ...COMMON, planId: true } }),
        prisma.coursePayment.findUnique({ where, select: { ...COMMON, courseId: true, clientId: true } }),
        prisma.programmePayment.findUnique({ where, select: { ...COMMON, programmeId: true, clientId: true } }),
        prisma.libraryPayment.findUnique({ where, select: { ...COMMON, itemId: true, clientId: true } }),
      ]);

  const base = (row: { id: string; tenantId: string; provider: PaymentProvider; status: PaymentStatus; amountCents: number; currency: string }) => ({
    id: row.id,
    tenantId: row.tenantId,
    reference,
    provider: row.provider,
    status: row.status,
    amountCents: row.amountCents,
    currency: row.currency,
  });

  if (platform) {
    return {
      ...base(platform),
      kind: "platform_subscription",
      metadata: { type: "platform_subscription", tenantId: platform.tenantId, planId: platform.planId },
    };
  }
  if (course) {
    return {
      ...base(course),
      kind: "course_purchase",
      metadata: { type: "course_purchase", tenantId: course.tenantId, courseId: course.courseId, clientId: course.clientId },
    };
  }
  if (programme) {
    return {
      ...base(programme),
      kind: "programme_purchase",
      metadata: {
        type: "programme_purchase",
        tenantId: programme.tenantId,
        programmeId: programme.programmeId,
        clientId: programme.clientId,
      },
    };
  }
  if (library) {
    return {
      ...base(library),
      kind: "library_purchase",
      metadata: { type: "library_purchase", tenantId: library.tenantId, itemId: library.itemId, clientId: library.clientId },
    };
  }
  return null;
}

/**
 * A checkout that never opened: the gateway refused it, so nobody was ever
 * sent to pay. Its pending row is closed as FAILED rather than left looking
 * like a payment still in flight. Only PENDING rows are touched, and a failure
 * here is swallowed — tidying up must not replace the error the customer needs.
 */
export async function markCheckoutFailed(reference: string): Promise<void> {
  if (!reference) return;
  const where = { externalRef: reference, status: "PENDING" as const };
  const data = { status: "FAILED" as const };
  try {
    await Promise.all([
      prisma.platformPayment.updateMany({ where, data }),
      prisma.coursePayment.updateMany({ where, data }),
      prisma.programmePayment.updateMany({ where, data }),
      prisma.libraryPayment.updateMany({ where, data }),
    ]);
  } catch {
    // Left PENDING: harmless, and it can never be fulfilled without a payment.
  }
}

export type AmountCheck =
  | { ok: true; overpaidCents: number }
  | { ok: false; reason: "currency_mismatch" | "underpaid" | "invalid_amount" };

/**
 * Is what was paid enough for what we charged?
 *
 * The gateway confirming "a payment succeeded" says nothing about how much. An
 * amount is part of a checkout request, and a request can be replayed with a
 * smaller number in it — so "success" on its own would let a ₦50,000 course go
 * for ₦20. The price on our pending row is the only figure the buyer could not
 * have touched.
 *
 * More than the price is accepted (a customer who rounds a bank transfer up
 * has still paid); less is not, and neither is the right number in the wrong
 * currency.
 */
export function checkPaidAmount(
  expected: { amountCents: number; currency: string },
  paid: { amountCents: number; currency: string }
): AmountCheck {
  if (!Number.isSafeInteger(paid.amountCents) || paid.amountCents < 0) {
    return { ok: false, reason: "invalid_amount" };
  }
  if (!Number.isSafeInteger(expected.amountCents) || expected.amountCents <= 0) {
    // A zero or negative price never reaches a gateway. If one is on the row,
    // the row is wrong, and nothing should be handed over on the strength of it.
    return { ok: false, reason: "invalid_amount" };
  }
  if (expected.currency.trim().toUpperCase() !== paid.currency.trim().toUpperCase()) {
    return { ok: false, reason: "currency_mismatch" };
  }
  if (paid.amountCents < expected.amountCents) return { ok: false, reason: "underpaid" };
  return { ok: true, overpaidCents: paid.amountCents - expected.amountCents };
}
