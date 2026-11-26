import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { requireActiveGateway, requireSaleSplit, startCheckout } from "@/lib/billing/providers";
import { checkoutReturnUrl } from "@/lib/billing/redirect";
import { billingReference } from "@/lib/billing/reference";
import { resolveItemAccess } from "@/lib/library/access";

const Body = z.object({
  // Older pages let the learner pick a gateway. The platform chooses now
  // (lib/billing/providers.ts), so this is accepted and not read.
  provider: z.string().optional(),
});

/** Mirrors the course purchase flow — same subaccount checks, same split. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { id } = await ctx.params;
    Body.parse(await request.json().catch(() => ({})));

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

    const gateway = requireActiveGateway();
    const subaccount = await prisma.tenantSubaccount.findUnique({ where: { tenantId: actor.tenantId } });
    const split = requireSaleSplit(subaccount, gateway, item.priceCents);

    const client = await prisma.client.findUnique({ where: { id: actor.clientId } });
    if (!client) throw new DomainError(404, "not_found", "Learner not found.");

    const currency = item.currency ?? "NGN";
    const reference = billingReference("library");

    // Written before the customer is sent to pay: the row a later "payment
    // succeeded" is checked against, for both the reference and the price.
    await prisma.libraryPayment.create({
      data: {
        tenantId: actor.tenantId,
        itemId: item.id,
        clientId: actor.clientId,
        provider: gateway.name,
        amountCents: item.priceCents,
        currency,
        externalRef: reference,
        platformFeeCents: split.platformFeeCents,
        tenantPayoutCents: item.priceCents - split.platformFeeCents,
      },
    });

    const checkout = await startCheckout(gateway, {
      email: client.email,
      customerName: [client.firstName, client.lastName].filter(Boolean).join(" ") || undefined,
      description: item.title ?? item.name,
      amountCents: item.priceCents,
      currency,
      reference,
      // Back to the item itself, where the page confirms the payment and the
      // file unlocks in place.
      callbackUrl: checkoutReturnUrl(request, `/library/${item.id}`, reference),
      metadata: {
        type: "library_purchase",
        tenantId: actor.tenantId,
        itemId: item.id,
        clientId: actor.clientId,
      },
      subaccount: split,
    });

    return ok({ checkoutUrl: checkout.authorizationUrl, reference });
  } catch (e) {
    return handleError(e);
  }
}
