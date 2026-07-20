import { prisma } from "@/lib/db/client";
import { rawPrisma } from "@/lib/db/raw-client";
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
  completeCoursePurchase,
  completeProgrammePurchase,
  completeLibraryPurchase,
} from "./subaccount";
import type { WebhookEvent } from "./types";

export type FulfillProvider = "PAYSTACK" | "FLUTTERWAVE";

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
 * Resolve the platform commission percentage for a tenant from its subaccount
 * config, falling back to the platform default. Used to compute payout splits at
 * fulfillment time so they match what the checkout route charged (previously the
 * webhooks hardcoded 10%).
 */
async function commissionPctFor(tenantId: string): Promise<number> {
  const sub = await prisma.tenantSubaccount.findUnique({
    where: { tenantId },
    select: { platformCommissionPct: true },
  });
  return sub?.platformCommissionPct ?? env.PLATFORM_COMMISSION_PCT;
}

/**
 * Idempotently fulfill a verified payment event. Shared by the provider webhooks
 * and the callback-verify endpoint so a payment fulfills exactly once regardless
 * of which signal arrives first.
 */
export async function fulfillPayment(
  event: WebhookEvent,
  provider: FulfillProvider
): Promise<void> {
  if (event.status !== "success") return;

  if (event.metadata.type === "platform_subscription") {
    const existing = await prisma.platformPayment.findUnique({
      where: { externalRef: event.reference },
    });
    if (existing?.status === "SUCCESS") return;

    await prisma.platformPayment.updateMany({
      where: { externalRef: event.reference },
      data: { status: "SUCCESS", completedAt: new Date(), providerData: event.raw as object },
    });
    await activateSubscription(event.metadata.tenantId, event.metadata.planId, provider);
    await audit({
      actorType: "SYSTEM",
      actorId: null,
      action: "billing.subscription_activated",
      tenantId: event.metadata.tenantId,
      targetType: "Tenant",
      targetId: event.metadata.tenantId,
      after: { planId: event.metadata.planId, provider } as object,
    });
    return;
  }

  if (event.metadata.type === "course_purchase") {
    const prior = await prisma.coursePayment.findUnique({
      where: { externalRef: event.reference },
      select: { status: true },
    });
    const alreadyFulfilled = prior?.status === "SUCCESS";
    const pct = await commissionPctFor(event.metadata.tenantId);
    const platformFeeCents = Math.round((event.amountCents * pct) / 100);
    await completeCoursePurchase({
      tenantId: event.metadata.tenantId,
      courseId: event.metadata.courseId,
      clientId: event.metadata.clientId,
      reference: event.reference,
      amountCents: event.amountCents,
      currency: event.currency,
      provider,
      platformFeeCents,
      tenantPayoutCents: event.amountCents - platformFeeCents,
      providerData: event.raw as object,
    });
    await audit({
      actorType: "SYSTEM",
      actorId: null,
      action: "course.enrolled",
      tenantId: event.metadata.tenantId,
      targetType: "Course",
      targetId: event.metadata.courseId,
      after: { clientId: event.metadata.clientId, reference: event.reference } as object,
    });
    if (!alreadyFulfilled) {
      await sendPurchaseEmails({
        kind: "course",
        tenantId: event.metadata.tenantId,
        clientId: event.metadata.clientId,
        itemId: event.metadata.courseId,
        amountCents: event.amountCents,
        currency: event.currency,
        reference: event.reference,
      });
    }
    return;
  }

  if (event.metadata.type === "library_purchase") {
    const prior = await prisma.libraryPayment.findUnique({
      where: { externalRef: event.reference },
      select: { status: true },
    });
    const alreadyFulfilled = prior?.status === "SUCCESS";
    const pct = await commissionPctFor(event.metadata.tenantId);
    const platformFeeCents = Math.round((event.amountCents * pct) / 100);
    await completeLibraryPurchase({
      tenantId: event.metadata.tenantId,
      itemId: event.metadata.itemId,
      clientId: event.metadata.clientId,
      reference: event.reference,
      amountCents: event.amountCents,
      currency: event.currency,
      provider,
      platformFeeCents,
      tenantPayoutCents: event.amountCents - platformFeeCents,
      providerData: event.raw as object,
    });
    await audit({
      actorType: "SYSTEM",
      actorId: null,
      action: "library.purchased",
      tenantId: event.metadata.tenantId,
      targetType: "LibraryItem",
      targetId: event.metadata.itemId,
      after: { clientId: event.metadata.clientId, reference: event.reference } as object,
    });
    if (!alreadyFulfilled) {
      await sendPurchaseEmails({
        kind: "library",
        tenantId: event.metadata.tenantId,
        clientId: event.metadata.clientId,
        itemId: event.metadata.itemId,
        amountCents: event.amountCents,
        currency: event.currency,
        reference: event.reference,
      });
    }
    return;
  }

  if (event.metadata.type === "programme_purchase") {
    const prior = await prisma.programmePayment.findUnique({
      where: { externalRef: event.reference },
      select: { status: true },
    });
    const alreadyFulfilled = prior?.status === "SUCCESS";
    const pct = await commissionPctFor(event.metadata.tenantId);
    const platformFeeCents = Math.round((event.amountCents * pct) / 100);
    const { enrolled } = await completeProgrammePurchase({
      tenantId: event.metadata.tenantId,
      programmeId: event.metadata.programmeId,
      clientId: event.metadata.clientId,
      reference: event.reference,
      amountCents: event.amountCents,
      currency: event.currency,
      provider,
      platformFeeCents,
      tenantPayoutCents: event.amountCents - platformFeeCents,
      providerData: event.raw as object,
    });
    await audit({
      actorType: "SYSTEM",
      actorId: null,
      action: "programme.enrolled",
      tenantId: event.metadata.tenantId,
      targetType: "Programme",
      targetId: event.metadata.programmeId,
      after: { clientId: event.metadata.clientId, reference: event.reference, enrolled } as object,
    });
    if (!alreadyFulfilled) {
      await sendPurchaseEmails({
        kind: "programme",
        tenantId: event.metadata.tenantId,
        clientId: event.metadata.clientId,
        itemId: event.metadata.programmeId,
        amountCents: event.amountCents,
        currency: event.currency,
        reference: event.reference,
      });
    }
    return;
  }
}
