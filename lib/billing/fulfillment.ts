import { prisma } from "@/lib/db/client";
import { rawPrisma } from "@/lib/db/raw-client";
import { runWithContext } from "@/lib/db/tenant-context";
import { env } from "@/lib/env";
import { audit } from "@/lib/auth/audit";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email/send";
import {
  loadTenantBrandingById,
  formatMoney,
} from "@/lib/email/branding";
import {
  enrollmentConfirmationEmail,
  paymentReceiptEmail,
} from "@/lib/email/templates";
import {
  activateSubscription,
  CLAIMABLE,
  completeCoursePurchase,
  completeProgrammePurchase,
  completeLibraryPurchase,
} from "./subaccount";
import { checkPaidAmount, findPaymentByReference, type AmountCheck, type PaymentRecord } from "./payments";
import type { GatewayName, WebhookEvent } from "./types";
import { recordEnrollmentReferral, recordPurchaseReferral } from "@/lib/referrals/attribution";
import { readReferralCookie } from "@/lib/referrals/cookie";

export type FulfillProvider = GatewayName;

/**
 * What became of a gateway's report that a payment succeeded.
 *
 * `rejected` is the one to notice: money did move, but not the money we asked
 * for, so nothing was handed over. It is logged and audited; nobody is charged
 * twice and nothing is silently accepted.
 */
export type FulfillOutcome =
  | { outcome: "fulfilled"; kind: PaymentRecord["kind"]; overpaidCents: number }
  | { outcome: "already_fulfilled"; kind: PaymentRecord["kind"] }
  | { outcome: "ignored"; reason: "not_successful" | "unknown_reference" | "wrong_gateway" | "refunded" }
  | { outcome: "rejected"; reason: Extract<AmountCheck, { ok: false }>["reason"] };

/**
 * Best-effort receipt + enrollment-confirmation emails for a paid course /
 * programme purchase. Never throws — payment fulfillment must not fail on an
 * email error. Uses the raw client because webhooks run without tenant context.
 */
async function sendPurchaseEmails(input: {
  kind: "course" | "programme" | "library";
  tenantId: string;
  clientId: string;
  itemId: string;
  amountCents: number;
  currency: string;
  reference: string;
}): Promise<void> {
  try {
    const [branding, client, item] = await Promise.all([
      loadTenantBrandingById(input.tenantId),
      rawPrisma.client.findUnique({
        where: { id: input.clientId },
        select: { email: true, firstName: true, lastName: true },
      }),
      input.kind === "course"
        ? rawPrisma.course.findUnique({ where: { id: input.itemId }, select: { title: true } })
        : input.kind === "programme"
          ? rawPrisma.programme.findUnique({ where: { id: input.itemId }, select: { title: true } })
          : // A library item's display title is optional; fall back to its name.
            rawPrisma.libraryItem
              .findUnique({ where: { id: input.itemId }, select: { title: true, name: true } })
              .then((r) => (r ? { title: r.title ?? r.name } : null)),
    ]);
    if (!client?.email || !item) return;

    const name = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || null;
    const actionUrl =
      input.kind === "library" ? `${branding.appOrigin}/library/${input.itemId}` : `${branding.appOrigin}/my-courses`;
    const dateLabel = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    await Promise.allSettled([
      sendEmail({
        to: client.email,
        subject: `Payment receipt — ${item.title}`,
        replyTo: branding.supportEmail,
        fromName: branding.name,
        html: paymentReceiptEmail(branding, {
          name,
          description: item.title,
          amountLabel: formatMoney(input.amountCents, input.currency),
          reference: input.reference,
          dateLabel,
          actionUrl,
        }),
      }),
      // A library purchase unlocks a file; nobody is "enrolled" in it, so it
      // gets the receipt only.
      ...(input.kind === "library"
        ? []
        : [
            sendEmail({
              to: client.email,
              subject: `You're enrolled — ${item.title}`,
              replyTo: branding.supportEmail,
              fromName: branding.name,
              html: enrollmentConfirmationEmail(branding, {
                name,
                itemName: item.title,
                itemType: input.kind,
                actionUrl,
              }),
            }),
          ]),
    ]);
  } catch (err) {
    logger.error({ err, reference: input.reference }, "purchase_email_failed");
  }
}

/**
 * The platform's commission for a tenant, from its subaccount config. Only a
 * fallback now: the split is fixed when the checkout is opened and written on
 * the payment row, and that figure — the one the gateway was actually told —
 * is the one that stands. This fills it in for a row that somehow has none.
 */
async function commissionPctFor(tenantId: string): Promise<number> {
  const sub = await prisma.tenantSubaccount.findUnique({
    where: { tenantId },
    select: { platformCommissionPct: true },
  });
  return sub?.platformCommissionPct ?? env.PLATFORM_COMMISSION_PCT;
}

/** The three things a learner can buy, reduced to what fulfilment needs to tell them apart. */
type Purchase = {
  kind: "course" | "programme" | "library";
  itemId: string;
  clientId: string;
  auditAction: string;
  targetType: string;
};

function purchaseOf(record: PaymentRecord): Purchase | null {
  const m = record.metadata;
  if (m.type === "course_purchase") {
    return { kind: "course", itemId: m.courseId, clientId: m.clientId, auditAction: "course.enrolled", targetType: "Course" };
  }
  if (m.type === "programme_purchase") {
    return {
      kind: "programme",
      itemId: m.programmeId,
      clientId: m.clientId,
      auditAction: "programme.enrolled",
      targetType: "Programme",
    };
  }
  if (m.type === "library_purchase") {
    return { kind: "library", itemId: m.itemId, clientId: m.clientId, auditAction: "library.purchased", targetType: "LibraryItem" };
  }
  return null;
}

export type FulfillOptions = {
  /**
   * For webhooks: there is no session, so the payment is found by its reference
   * alone and the rest runs as that payment's tenant.
   */
  anyTenant?: boolean;
  /**
   * Takes the work that is worth doing but not worth waiting for — today, the
   * receipt emails. A webhook passes Next's `after`, so the gateway gets its
   * answer before any mail server is spoken to. Left out, that work is awaited.
   */
  defer?: (work: () => Promise<void>) => void;
};

/**
 * Fulfil a payment a gateway says succeeded — once, and only if it really is
 * the payment we asked for.
 *
 * Shared by the gateway webhooks and the redirect-verify endpoint, which
 * usually both fire for the same payment. Whichever arrives first does the
 * work; the other finds it done.
 *
 * The event contributes three facts: a reference, an amount and a currency.
 * Everything else — who paid, for what, and how much it should have been —
 * comes from the payment row we wrote when the checkout was opened. An event
 * whose reference we never issued is ignored, and one that paid less than the
 * price, or in another currency, is refused.
 */
export async function fulfillPayment(
  event: WebhookEvent,
  provider: FulfillProvider,
  opts: FulfillOptions = {}
): Promise<FulfillOutcome> {
  if (event.status !== "success") return { outcome: "ignored", reason: "not_successful" };

  const record = await findPaymentByReference(event.reference, { anyTenant: opts.anyTenant });
  if (!record) {
    logger.warn({ reference: event.reference, provider }, "payment_unknown_reference");
    return { outcome: "ignored", reason: "unknown_reference" };
  }

  const settle = () => settlePayment(record, event, provider, opts);
  return opts.anyTenant
    ? runWithContext({ mode: "tenant-admin", tenantId: record.tenantId }, settle)
    : settle();
}

async function settlePayment(
  record: PaymentRecord,
  event: WebhookEvent,
  provider: FulfillProvider,
  opts: FulfillOptions
): Promise<FulfillOutcome> {
  // A payment is confirmed by the gateway it was sent to. "Paystack says this
  // Monnify payment succeeded" is not something that happens by accident.
  if (record.provider !== provider) {
    logger.error({ reference: record.reference, expected: record.provider, got: provider }, "payment_wrong_gateway");
    return { outcome: "ignored", reason: "wrong_gateway" };
  }

  // Refunded is final. The gateway may well still say "paid" — the money did
  // arrive, once — but the purchase has been undone on purpose.
  if (record.status === "REFUNDED") {
    logger.warn({ reference: record.reference }, "payment_refunded_not_refulfilled");
    return { outcome: "ignored", reason: "refunded" };
  }

  const alreadyFulfilled = record.status === "SUCCESS";

  // The amount was checked when the payment was first fulfilled. Checking a
  // replay again could only ever turn a settled purchase into a noisy refusal.
  let overpaidCents = 0;
  if (!alreadyFulfilled) {
    const check = checkPaidAmount(record, { amountCents: event.amountCents, currency: event.currency });
    if (!check.ok) {
      logger.error(
        {
          reference: record.reference,
          reason: check.reason,
          expectedCents: record.amountCents,
          expectedCurrency: record.currency,
          paidCents: event.amountCents,
          paidCurrency: event.currency,
        },
        "payment_amount_rejected"
      );
      await audit({
        actorType: "SYSTEM",
        actorId: null,
        action: "billing.payment_rejected",
        tenantId: record.tenantId,
        targetType: "Payment",
        targetId: record.id,
        after: {
          reference: record.reference,
          reason: check.reason,
          expected: { amountCents: record.amountCents, currency: record.currency },
          paid: { amountCents: event.amountCents, currency: event.currency },
        } as object,
      });
      return { outcome: "rejected", reason: check.reason };
    }
    overpaidCents = check.overpaidCents;
    if (overpaidCents > 0) {
      // Accepted, but somebody is owed change. Nothing here refunds it.
      logger.warn({ reference: record.reference, overpaidCents, currency: record.currency }, "payment_overpaid");
    }
  }

  if (record.metadata.type === "platform_subscription") {
    // Activating a subscription restarts its month, so unlike a purchase it is
    // never repeated for a payment already marked paid.
    if (alreadyFulfilled) return { outcome: "already_fulfilled", kind: record.kind };

    // Activate BEFORE marking paid. If the process dies in between, the retry
    // still sees an unpaid row and activates again — harmless seconds later —
    // where the other order would leave a paid subscription that never starts.
    await activateSubscription(record.metadata.tenantId, record.metadata.planId, provider);
    const { count } = await prisma.platformPayment.updateMany({
      where: { externalRef: record.reference, status: { in: [...CLAIMABLE] } },
      data: { status: "SUCCESS", completedAt: new Date(), providerData: event.raw as object },
    });
    if (count !== 1) return { outcome: "already_fulfilled", kind: record.kind };

    await audit({
      actorType: "SYSTEM",
      actorId: null,
      action: "billing.subscription_activated",
      tenantId: record.metadata.tenantId,
      targetType: "Tenant",
      targetId: record.metadata.tenantId,
      after: { planId: record.metadata.planId, provider, reference: record.reference } as object,
    });
    return { outcome: "fulfilled", kind: record.kind, overpaidCents };
  }

  const purchase = purchaseOf(record);
  if (!purchase) return { outcome: "ignored", reason: "unknown_reference" };

  const pct = await commissionPctFor(record.tenantId);
  const platformFeeCents = Math.round((record.amountCents * pct) / 100);
  const common = {
    tenantId: record.tenantId,
    clientId: purchase.clientId,
    reference: record.reference,
    platformFeeCents,
    tenantPayoutCents: record.amountCents - platformFeeCents,
    providerData: event.raw as object,
  };

  // Each of these marks the payment paid (once) and grants what was bought
  // (every time — see the note above `PurchaseInput` in ./subaccount).
  let claimed: boolean;
  let detail: Record<string, unknown> = {};
  if (purchase.kind === "course") {
    ({ claimed } = await completeCoursePurchase({ ...common, courseId: purchase.itemId }));
  } else if (purchase.kind === "library") {
    ({ claimed } = await completeLibraryPurchase({ ...common, itemId: purchase.itemId }));
  } else {
    const done = await completeProgrammePurchase({ ...common, programmeId: purchase.itemId });
    claimed = done.claimed;
    detail = { enrolled: done.enrolled };
  }

  // Everything below happens exactly once per purchase, however many times the
  // gateway tells us about it.
  if (!claimed) return { outcome: "already_fulfilled", kind: record.kind };

  await audit({
    actorType: "SYSTEM",
    actorId: null,
    action: purchase.auditAction,
    tenantId: record.tenantId,
    targetType: purchase.targetType,
    targetId: purchase.itemId,
    after: { clientId: purchase.clientId, reference: record.reference, provider, ...detail } as object,
  });

  // REFERRAL-HOOK: purchase fulfilled
  // Reached once per purchase, never on a replay, and only after the amount
  // check has passed. In scope here:
  //   record.tenantId      — the academy
  //   purchase.clientId    — the learner who bought
  //   purchase.kind        — "course" | "programme" | "library"
  //   purchase.itemId      — id of the course / programme / library item
  //   record.amountCents   — the price charged, in kobo
  //   record.currency
  //   record.reference     — unique per purchase; use it to make the referral
  //                          event idempotent
  // Tenant context is already bound (session, or `runWithContext` for a
  // webhook), so scoped models can be written directly. Whatever is called
  // here must not throw: a failure to attribute a referral is not a reason to
  // fail a purchase the customer has paid for.
  //
  // Who gets the credit: the `?ref=` cookie when the learner's own browser is
  // the one confirming the payment (the redirect back from the gateway), and
  // otherwise — a webhook has no visitor — whoever referred the learner when
  // they signed up. The attribution functions never throw and record each
  // reference once, so the redirect and the webhook racing is harmless.
  const cookieCode = await readReferralCookie();
  await recordPurchaseReferral({
    tenantId: record.tenantId,
    clientId: purchase.clientId,
    reference: record.reference,
    amountCents: record.amountCents,
    currency: record.currency,
    courseId: purchase.kind === "course" ? purchase.itemId : null,
    programmeId: purchase.kind === "programme" ? purchase.itemId : null,
    libraryItemId: purchase.kind === "library" ? purchase.itemId : null,
    cookieCode,
  });
  // A paid course or programme is also an enrolment, and is counted as one.
  try {
    if (purchase.kind === "course") {
      const enrollment = await prisma.enrollment.findUnique({
        where: { courseId_clientId: { courseId: purchase.itemId, clientId: purchase.clientId } },
        select: { id: true },
      });
      if (enrollment) {
        await recordEnrollmentReferral({
          tenantId: record.tenantId,
          clientId: purchase.clientId,
          enrollmentId: enrollment.id,
          courseId: purchase.itemId,
          cookieCode,
        });
      }
    } else if (purchase.kind === "programme") {
      const membership = await prisma.programmeEnrollment.findUnique({
        where: { programmeId_clientId: { programmeId: purchase.itemId, clientId: purchase.clientId } },
        select: { id: true },
      });
      if (membership) {
        await recordEnrollmentReferral({
          tenantId: record.tenantId,
          clientId: purchase.clientId,
          enrollmentId: membership.id,
          programmeId: purchase.itemId,
          cookieCode,
        });
      }
    }
  } catch (err) {
    logger.warn({ err, reference: record.reference }, "referral_enrollment_lookup_failed");
  }

  const sendReceipts = () =>
    sendPurchaseEmails({
      kind: purchase.kind,
      tenantId: record.tenantId,
      clientId: purchase.clientId,
      itemId: purchase.itemId,
      // The price, not the amount received: a receipt states what was bought
      // for how much, and those are the figures on our books.
      amountCents: record.amountCents,
      currency: record.currency,
      reference: record.reference,
    });
  if (opts.defer) opts.defer(sendReceipts);
  else await sendReceipts();

  return { outcome: "fulfilled", kind: record.kind, overpaidCents };
}
