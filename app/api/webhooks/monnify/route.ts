import { after } from "next/server";
import { ok, fail } from "@/lib/api/respond";
import { logger } from "@/lib/logger";
import { fulfillPayment } from "@/lib/billing/fulfillment";
import { MonnifyError, monnifyProvider } from "@/lib/billing/monnify";
import { env } from "@/lib/env";

/**
 * Monnify's webhook. Configure this URL in the Monnify dashboard under
 * Settings → API Keys & Webhooks.
 *
 * The order of work is what makes it safe:
 *
 *  1. Authenticate. The body is read as raw bytes and its HMAC compared with
 *     the `monnify-signature` header. Anything unsigned or altered ends here —
 *     acknowledged, so a prober learns nothing, and otherwise ignored.
 *  2. Disbelieve. A valid signature proves Monnify sent this, at some point.
 *     It does not prove the payment still stands, and a captured notification
 *     can be sent again. So the body is used for exactly one thing — which
 *     reference to ask about — and Monnify is asked directly.
 *  3. Fulfil, from our own payment row: what was bought, for whom, and what it
 *     should have cost. An amount or currency that does not match is refused.
 *
 * Every step after authentication is idempotent, so a notification that
 * arrives twice, or after the customer's own redirect has already confirmed
 * the payment, changes nothing.
 */
/**
 * MONNIFY_CALLBACK_IPS, when set, is the list of addresses a webhook may come
 * from. It is a second lock, not the first: the signature below is what proves
 * who sent it. Unset means any address (signature still required).
 */
function fromAllowedAddress(request: Request): boolean {
  const allowed = (env.MONNIFY_CALLBACK_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "";
  // No address to judge by (local development, a host that does not forward
  // one): the list cannot be applied, and the signature still has to pass.
  if (!address) return true;
  return allowed.includes(address);
}

export async function POST(request: Request) {
  if (!fromAllowedAddress(request)) {
    logger.warn({ from: request.headers.get("x-forwarded-for") }, "monnify_webhook_wrong_address");
    return ok({ received: true });
  }
  const claimed = await monnifyProvider.verifyWebhook(request);
  // Unsigned, tampered, not configured, or an event we do not act on (refunds,
  // disbursements, settlements all arrive at this URL too).
  if (!claimed) return ok({ received: true });

  try {
    const confirmed = await monnifyProvider.verifyTransaction(claimed.reference);
    if (!confirmed) {
      // Monnify itself does not agree that this is paid. Nothing to retry.
      logger.warn({ reference: claimed.reference }, "monnify_webhook_unconfirmed");
      return ok({ received: true });
    }

    const result = await fulfillPayment(confirmed, "MONNIFY", {
      anyTenant: true,
      // Monnify asks for an answer straight away and treats a slow one as a
      // failure. The purchase is granted before we reply; the receipt emails,
      // which wait on a mail server, go out after.
      defer: (work) => {
        try {
          after(work);
        } catch {
          // `after` only exists inside a request. Anywhere else (a script
          // driving this handler directly) just let the work run on its own;
          // it never rejects.
          void work();
        }
      },
    });
    if (result.outcome !== "fulfilled" && result.outcome !== "already_fulfilled") {
      logger.warn({ reference: claimed.reference, result }, "monnify_webhook_not_fulfilled");
    }
    return ok({ received: true });
  } catch (err) {
    // Only reached when we could not find out, or could not finish: Monnify was
    // unreachable for the re-query, or the database failed part-way. Answering
    // with an error is what makes Monnify send the notification again.
    logger.error(
      {
        reference: claimed.reference,
        kind: err instanceof MonnifyError ? err.kind : "unknown",
        err: err instanceof MonnifyError ? err.message : err,
      },
      "monnify_webhook_failed"
    );
    return fail(503, "retry_later", "Temporarily unable to process this notification.");
  }
}
