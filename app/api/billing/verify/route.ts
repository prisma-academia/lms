import { z } from "zod";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { resolveRequestContext } from "@/lib/db/resolve-context";
import { fulfillPayment } from "@/lib/billing/fulfillment";
import { findPaymentByReference } from "@/lib/billing/payments";
import { gatewayError, gatewayForPayment } from "@/lib/billing/providers";
import { isBillingReference } from "@/lib/billing/redirect";

const Body = z.object({
  reference: z.string().min(1).max(100),
});

/**
 * Callback/redirect fallback. After a checkout the gateway sends the customer
 * back with the payment reference in the query string; the page posts it here
 * so the purchase fulfils even if the gateway's webhook is delayed or missed.
 * Fully idempotent — safe to call after the webhook has already done the work.
 *
 * Nothing in the request is trusted beyond the reference itself. Which gateway
 * to ask, what was bought and what it should have cost all come from our own
 * payment row — and finding that row is also the proof that the reference is
 * one we issued. The lookup runs under the caller's tenant scope, so a
 * reference from another academy is simply "unknown".
 */
export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const { reference } = Body.parse(await request.json());

    const found = isBillingReference(reference) ? await findPaymentByReference(reference) : null;
    // Subscription payments live in a table that is not tenant-scoped, so the
    // scope the other three get for free is applied here by hand.
    const scope = await resolveRequestContext();
    const record = found && (!scope?.tenantId || scope.tenantId === found.tenantId) ? found : null;
    if (!record) throw new DomainError(404, "unknown_reference", "Unknown payment reference.");

    // Already fulfilled — nothing to do.
    if (record.status === "SUCCESS") return ok({ status: "success" });

    const gateway = gatewayForPayment(record.provider);
    // Recorded by staff, or taken on a gateway that has since been switched
    // off: there is nobody to ask, so it stays as it is.
    if (!gateway) return ok({ status: "pending" });

    let event;
    try {
      event = await gateway.provider.verifyTransaction(reference);
    } catch (err) {
      throw gatewayError(err, "customer", "verify");
    }
    if (!event) return ok({ status: "pending" });

    const result = await fulfillPayment(event, gateway.name);
    if (result.outcome === "fulfilled" || result.outcome === "already_fulfilled") {
      return ok({ status: "success" });
    }
    if (result.outcome === "rejected") {
      // Money arrived, but not the amount charged. Say so plainly — "still
      // processing" would have the customer waiting for something that will
      // never happen on its own.
      throw new DomainError(
        409,
        "payment_mismatch",
        "We received a payment, but it does not match the amount due, so it has not been applied. Please contact support and quote your payment reference."
      );
    }
    return ok({ status: "pending" });
  } catch (e) {
    return handleError(e);
  }
}
