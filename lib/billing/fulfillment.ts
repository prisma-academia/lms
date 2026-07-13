import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { audit } from "@/lib/auth/audit";
import {
  activateSubscription,
  completeCoursePurchase,
  completeProgrammePurchase,
} from "./subaccount";
import type { WebhookEvent } from "./types";

export type FulfillProvider = "PAYSTACK" | "FLUTTERWAVE";

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
    return;
  }

  if (event.metadata.type === "programme_purchase") {
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
    return;
  }
}
