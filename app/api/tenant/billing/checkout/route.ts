import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { requireActiveGateway, startCheckout } from "@/lib/billing/providers";
import { checkoutReturnUrl } from "@/lib/billing/redirect";
import { billingReference } from "@/lib/billing/reference";

const Body = z.object({
  planId: z.string().min(1),
  // Sent by older pages that let staff pick a gateway. There is one gateway
  // now, chosen by the platform, so this is accepted and not read.
  provider: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_BILLING_WRITE.key);
    const gateway = requireActiveGateway();

    const body = Body.parse(await request.json());
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: body.planId } });
    if (!plan || !plan.isPublic || plan.priceMonthlyCents <= 0) {
      throw new DomainError(400, "invalid_plan", "Invalid subscription plan.");
    }

    const owner = await prisma.tenantUser.findFirst({
      where: { tenantId: actor.tenantId, isOwner: true },
    });
    if (!owner) throw new DomainError(404, "not_found", "Owner not found.");

    const reference = billingReference("sub");
    await prisma.platformPayment.create({
      data: {
        tenantId: actor.tenantId,
        planId: plan.id,
        provider: gateway.name,
        amountCents: plan.priceMonthlyCents,
        currency: plan.currency,
        externalRef: reference,
      },
    });

    const checkout = await startCheckout(
      gateway,
      {
        email: owner.email,
        customerName: [owner.firstName, owner.lastName].filter(Boolean).join(" ") || undefined,
        description: `${plan.name} plan — monthly subscription`,
        amountCents: plan.priceMonthlyCents,
        currency: plan.currency,
        reference,
        callbackUrl: checkoutReturnUrl(request, "/admin/billing", reference),
        metadata: { type: "platform_subscription", tenantId: actor.tenantId, planId: plan.id },
      },
      "staff"
    );

    return ok({ checkoutUrl: checkout.authorizationUrl, reference });
  } catch (e) {
    return handleError(e);
  }
}
