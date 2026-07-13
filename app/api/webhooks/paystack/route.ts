import { paystackProvider } from "@/lib/billing/paystack";
import { fulfillPayment } from "@/lib/billing/fulfillment";
import { ok } from "@/lib/api/respond";

export async function POST(request: Request) {
  const event = await paystackProvider.verifyWebhook(request);
  if (!event) return ok({ received: true });

  await fulfillPayment(event, "PAYSTACK");
  return ok({ received: true });
}
