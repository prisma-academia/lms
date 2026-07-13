export type PaymentMetadata =
  | { type: "platform_subscription"; tenantId: string; planId: string }
  | { type: "course_purchase"; tenantId: string; courseId: string; clientId: string }
  | { type: "programme_purchase"; tenantId: string; programmeId: string; clientId: string };

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
  /**
   * Verify a transaction directly with the provider by its reference. Used by
   * the callback/redirect fallback so a payment still fulfills if the webhook is
   * delayed or missed. Returns the normalized event, or null if not successful.
   */
  verifyTransaction(reference: string): Promise<WebhookEvent | null>;
}
