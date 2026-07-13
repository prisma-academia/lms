import { flutterwaveProvider } from "@/lib/billing/flutterwave";
import { fulfillPayment } from "@/lib/billing/fulfillment";
import { ok } from "@/lib/api/respond";

export async function POST(request: Request) {
  const event = await flutterwaveProvider.verifyWebhook(request);
  if (!event) return ok({ received: true });

  await fulfillPayment(event, "FLUTTERWAVE");
  return ok({ received: true });
}
