import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { billingConfigured } from "@/lib/env";
import { paystackProvider } from "@/lib/billing/paystack";
import { flutterwaveProvider, flutterwaveReference } from "@/lib/billing/flutterwave";
import { billingReference } from "@/lib/billing/reference";
import { resolveItemAccess } from "@/lib/library/access";

const Body = z.object({ provider: z.enum(["paystack", "flutterwave"]).optional() });

/** Mirrors the course purchase flow — same subaccount checks, same split. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { id } = await ctx.params;
    const body = Body.parse(await request.json());

    const item = await prisma.libraryItem.findFirst({ where: { id } });
    if (!item) throw new DomainError(404, "not_found", "That item is not available.");

    if (item.isFree || item.priceCents == null || item.priceCents <= 0) {
      throw new DomainError(400, "not_purchasable", "This item is not for sale.");
    }
    // A learner who already has access through a grant must not be charged for
    // something they can already open.
    const access = await resolveItemAccess(actor, id);
    if (access.allowed) {
      throw new DomainError(409, "already_accessible", "You already have access to this item.");
    }

    if (!billingConfigured()) {
      throw new DomainError(503, "billing_unconfigured", "Payments are not available.");
    }

    const subaccount = await prisma.tenantSubaccount.findUnique({ where: { tenantId: actor.tenantId } });
    if (!subaccount?.courseSalesEnabled) {
      throw new DomainError(400, "sales_disabled", "Sales are not enabled for this academy.");
    }

    const providerName = body.provider ?? (subaccount.defaultProvider === "FLUTTERWAVE" ? "flutterwave" : "paystack");
    const provider = providerName === "paystack" ? paystackProvider : flutterwaveProvider;

    if (providerName === "paystack" && (!subaccount.paystackSubaccountCode || subaccount.paystackStatus !== "ACTIVE")) {
      throw new DomainError(400, "subaccount_inactive", "Paystack payouts are not active.");
    }
    if (
      providerName === "flutterwave" &&
      (!subaccount.flutterwaveSubaccountId || subaccount.flutterwaveStatus !== "ACTIVE")
    ) {
      throw new DomainError(400, "subaccount_inactive", "Flutterwave payouts are not active.");
    }

    const client = await prisma.client.findUnique({ where: { id: actor.clientId } });
    if (!client) throw new DomainError(404, "not_found", "Learner not found.");

    const currency = item.currency ?? "NGN";
    const reference =
      providerName === "flutterwave" ? flutterwaveReference("library") : billingReference("library");
    const platformFeeCents = Math.round((item.priceCents * subaccount.platformCommissionPct) / 100);

    await prisma.libraryPayment.create({
      data: {
        tenantId: actor.tenantId,
        itemId: item.id,
        clientId: actor.clientId,
        provider: providerName === "paystack" ? "PAYSTACK" : "FLUTTERWAVE",
        amountCents: item.priceCents,
        currency,
        externalRef: reference,
        platformFeeCents,
        tenantPayoutCents: item.priceCents - platformFeeCents,
      },
    });

    const host = request.headers.get("host") ?? "localhost:3000";
    const callbackUrl = `http://${host}/library/${item.id}?checkout=done`;

    const checkout = await provider.initializeCheckout({
      email: client.email,
      amountCents: item.priceCents,
      currency,
      reference,
      callbackUrl,
      metadata: {
        type: "library_purchase",
        tenantId: actor.tenantId,
        itemId: item.id,
        clientId: actor.clientId,
      },
      subaccount: {
        paystackCode: subaccount.paystackSubaccountCode ?? undefined,
        flutterwaveId: subaccount.flutterwaveSubaccountId ?? undefined,
        platformFeeCents,
        commissionPct: subaccount.platformCommissionPct,
      },
    });

    return ok({ checkoutUrl: checkout.authorizationUrl, reference });
  } catch (e) {
    return handleError(e);
  }
}
