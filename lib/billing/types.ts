export type PaymentMetadata =
  | { type: "platform_subscription"; tenantId: string; planId: string }
  | { type: "course_purchase"; tenantId: string; courseId: string; clientId: string };

export type CheckoutResult = {
  authorizationUrl: string;
  reference: string;
};

export type WebhookEvent = {
  reference: string;
  status: "success" | "failed";
  amountCents: number;
  currency: string;
  metadata: PaymentMetadata;
  raw: unknown;
};

export interface BillingProvider {
  initializeCheckout(input: {
    email: string;
    amountCents: number;
    currency: string;
    reference: string;
    callbackUrl: string;
    metadata: PaymentMetadata;
    subaccount?: {
      paystackCode?: string;
      flutterwaveId?: string;
      platformFeeCents?: number;
      commissionPct?: number;
    };
  }): Promise<CheckoutResult>;
  verifyWebhook(request: Request): Promise<WebhookEvent | null>;
}
