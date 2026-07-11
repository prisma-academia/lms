import { prisma } from "@/lib/db/client";
import { flutterwaveProvider } from "@/lib/billing/flutterwave";
import { activateSubscription, completeCoursePurchase } from "@/lib/billing/subaccount";
import { audit } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";

export async function POST(request: Request) {
  const event = await flutterwaveProvider.verifyWebhook(request);
  if (!event) return ok({ received: true });
  if (event.status !== "success") return ok({ received: true });

  if (event.metadata.type === "platform_subscription") {
    await prisma.platformPayment.updateMany({
      where: { externalRef: event.reference },
      data: { status: "SUCCESS", completedAt: new Date(), providerData: event.raw as object },
    });
    await activateSubscription(event.metadata.tenantId, event.metadata.planId, "FLUTTERWAVE");
    await audit({
      actorType: "SYSTEM",
      actorId: null,
      action: "billing.subscription_activated",
      tenantId: event.metadata.tenantId,
      targetType: "Tenant",
      targetId: event.metadata.tenantId,
      after: { planId: event.metadata.planId, provider: "FLUTTERWAVE" } as object,
    });
  }

  if (event.metadata.type === "course_purchase") {
    const commission = Math.round((event.amountCents * 10) / 100);
    await completeCoursePurchase({
      tenantId: event.metadata.tenantId,
      courseId: event.metadata.courseId,
      clientId: event.metadata.clientId,
      reference: event.reference,
      amountCents: event.amountCents,
      currency: event.currency,
      provider: "FLUTTERWAVE",
      platformFeeCents: commission,
      tenantPayoutCents: event.amountCents - commission,
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
  }

  return ok({ received: true });
}
