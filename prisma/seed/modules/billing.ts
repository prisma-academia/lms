import { DAY, type SeedContext } from "../index";
import { billingReference } from "../../../lib/billing/reference";

/**
 * Seed platform subscription payment history for the demo tenant — a few
 * successful monthly charges against its current Growth plan, so the tenant
 * billing panel and platform analytics show real revenue.
 */
export async function seedBilling(ctx: SeedContext): Promise<void> {
  const { prisma, tenantId, now } = ctx;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionPlanId: true },
  });
  if (!tenant?.subscriptionPlanId) return;

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: tenant.subscriptionPlanId },
    select: { id: true, priceMonthlyCents: true, currency: true },
  });
  if (!plan) return;

  // Three prior monthly charges (SUCCESS), most recent first.
  for (let i = 1; i <= 3; i++) {
    const completedAt = new Date(now - i * 30 * DAY);
    await prisma.platformPayment.create({
      data: {
        tenantId,
        planId: plan.id,
        provider: "PAYSTACK",
        amountCents: plan.priceMonthlyCents,
        currency: plan.currency,
        status: "SUCCESS",
        externalRef: billingReference("sub"),
        completedAt,
        createdAt: completedAt,
      },
    });
  }
}
