export type PaymentMetadata =
  | { type: "platform_subscription"; tenantId: string; planId: string }
  | { type: "course_purchase"; tenantId: string; courseId: string; clientId: string }
  | { type: "programme_purchase"; tenantId: string; programmeId: string; clientId: string }
  | { type: "library_purchase"; tenantId: string; itemId: string; clientId: string };

/**
 * A payment gateway that can take a checkout. MONNIFY is the one in use;
 * PAYSTACK and FLUTTERWAVE are kept so payments started before the switch can
 * still be confirmed. (`PaymentProvider.MANUAL` is not a gateway.)
 */
export type GatewayName = "MONNIFY" | "PAYSTACK" | "FLUTTERWAVE";

export type CheckoutResult = {
  authorizationUrl: string;
  reference: string;
};

/**
 * What a gateway says about one payment, in our units.
 *
 * This is evidence that money moved — nothing more. What was bought, by whom,
 * and how much it should have cost are read from our own payment row when the
 * payment is fulfilled (see `fulfillPayment`), never from here.
 */
export type WebhookEvent = {
  reference: string;
  status: "success" | "failed";
  /** Amount actually paid, in minor units (kobo). */
  amountCents: number;
  currency: string;
  /**
   * Metadata the gateway echoed back, when it does that. Informational only:
   * Monnify does not return ours, and fulfilment does not read this field.
   */
  metadata?: PaymentMetadata;
  raw: unknown;
};

export interface BillingProvider {
  initializeCheckout(input: {
    email: string;
    /** Shown on the gateway's payment page and receipt. */
    customerName?: string;
    /** One line saying what is being paid for. */
    description?: string;
    amountCents: number;
    currency: string;
    reference: string;
    callbackUrl: string;
    metadata: PaymentMetadata;
    subaccount?: {
      paystackCode?: string;
      flutterwaveId?: string;
      /** Present only when the academy's Monnify sub-account is ACTIVE. */
      monnifyCode?: string;
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
