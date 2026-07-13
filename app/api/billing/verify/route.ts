import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { paystackProvider } from "@/lib/billing/paystack";
import { flutterwaveProvider } from "@/lib/billing/flutterwave";
import { fulfillPayment, type FulfillProvider } from "@/lib/billing/fulfillment";
import type { PaymentProvider } from "@/lib/generated/prisma/enums";

const Body = z.object({
  reference: z.string().min(1),
});

/**
 * Callback/redirect fallback. After a checkout the provider redirects back with
 * the transaction reference in the query string; the client posts it here so the
 * purchase fulfills even if the provider webhook is delayed or missed. Fully
 * idempotent — safe to call after the webhook already fulfilled.
 *
 * The provider is resolved from our own PENDING payment row (not client input),
 * which also proves the reference is one we issued.
 */
export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const { reference } = Body.parse(await request.json());

    // Find which payment table owns this reference, and its provider + status.
    const [platform, course, programme] = await Promise.all([
      prisma.platformPayment.findUnique({ where: { externalRef: reference }, select: { provider: true, status: true } }),
      prisma.coursePayment.findUnique({ where: { externalRef: reference }, select: { provider: true, status: true } }),
      prisma.programmePayment.findUnique({ where: { externalRef: reference }, select: { provider: true, status: true } }),
    ]);

    const record = platform ?? course ?? programme;
    if (!record) throw new DomainError(404, "unknown_reference", "Unknown payment reference.");

    // Already fulfilled — nothing to do.
    if (record.status === "SUCCESS") return ok({ status: "success" });

    const providerName = toFulfillProvider(record.provider);
    const provider = providerName === "PAYSTACK" ? paystackProvider : flutterwaveProvider;

    const event = await provider.verifyTransaction(reference);
    if (!event) return ok({ status: "pending" });

    await fulfillPayment(event, providerName);
    return ok({ status: "success" });
  } catch (e) {
    return handleError(e);
  }
}

function toFulfillProvider(provider: PaymentProvider): FulfillProvider {
  return provider === "FLUTTERWAVE" ? "FLUTTERWAVE" : "PAYSTACK";
}
