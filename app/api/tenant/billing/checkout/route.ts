import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { billingConfigured } from "@/lib/env";
import { paystackProvider } from "@/lib/billing/paystack";
import { flutterwaveProvider } from "@/lib/billing/flutterwave";
import { billingReference } from "@/lib/billing/reference";

const Body = z.object({
  planId: z.string().min(1),
  provider: z.enum(["paystack", "flutterwave"]),
});

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_BILLING_WRITE.key);
    if (!billingConfigured()) {
      throw new DomainError(503, "billing_unconfigured", "Billing is not configured on this platform.");
    }

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
        provider: body.provider === "paystack" ? "PAYSTACK" : "FLUTTERWAVE",
        amountCents: plan.priceMonthlyCents,
        currency: plan.currency,
        externalRef: reference,
      },
    });

    const host = request.headers.get("host") ?? "localhost:3000";
    const callbackUrl = `http://${host}/admin/billing?checkout=done`;

    const provider = body.provider === "paystack" ? paystackProvider : flutterwaveProvider;
    const checkout = await provider.initializeCheckout({
      email: owner.email,
      amountCents: plan.priceMonthlyCents,
      currency: plan.currency,
      reference,
      callbackUrl,
      metadata: { type: "platform_subscription", tenantId: actor.tenantId, planId: plan.id },
    });

    return ok({ checkoutUrl: checkout.authorizationUrl, reference: checkout.reference });
  } catch (e) {
    return handleError(e);
  }
}
