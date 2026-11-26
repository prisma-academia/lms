import { DomainError } from "@/lib/api/errors";
import { env, flutterwaveConfigured, monnifyConfigured, paystackConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { PaymentProvider, SubaccountStatus } from "@/lib/generated/prisma/enums";
import { flutterwaveProvider } from "./flutterwave";
import { MonnifyError, monnifyProvider } from "./monnify";
import { paystackProvider } from "./paystack";
import type { BillingProvider, CheckoutResult, GatewayName } from "./types";
import { markCheckoutFailed } from "./payments";
import { rememberCheckoutReferrer } from "@/lib/referrals/attribution";
import { readReferralCookie } from "@/lib/referrals/cookie";

/**
 * Which payment gateway is in use — decided here and nowhere else.
 *
 * Every checkout route used to carry its own `provider === "paystack" ? … : …`
 * with its own copy of the sub-account checks, so changing gateway meant
 * finding and editing all of them identically. Routes now ask this module two
 * questions: "which gateway takes new payments?" and "which gateway took THIS
 * payment?". The answers differ during a switch-over, and only this file knows.
 */

const GATEWAYS: Record<GatewayName, { label: string; provider: BillingProvider; configured: () => boolean }> = {
  MONNIFY: { label: "Monnify", provider: monnifyProvider, configured: monnifyConfigured },
  PAYSTACK: { label: "Paystack", provider: paystackProvider, configured: paystackConfigured },
  FLUTTERWAVE: { label: "Flutterwave", provider: flutterwaveProvider, configured: flutterwaveConfigured },
};

/**
 * The order gateways are tried in when nothing says otherwise. Monnify is one
 * provider among several, not the only one: with Monnify's keys absent (or
 * MONNIFY_ENABLED=false) checkouts go to Paystack, then Flutterwave.
 */
const PREFERENCE: GatewayName[] = ["MONNIFY", "PAYSTACK", "FLUTTERWAVE"];

/**
 * The gateway NEW checkouts go to: PAYMENT_PROVIDER when it names a gateway
 * that is configured, otherwise the first configured one. When none is
 * configured this still names the preferred one, so screens have something to
 * call "the gateway" while saying it is not set up.
 */
export function checkoutGatewayName(): GatewayName {
  const wanted = (env.PAYMENT_PROVIDER ?? "").trim().toUpperCase() as GatewayName;
  if (wanted in GATEWAYS && GATEWAYS[wanted].configured()) return wanted;
  return PREFERENCE.find((name) => GATEWAYS[name].configured()) ?? (wanted in GATEWAYS ? wanted : PREFERENCE[0]);
}

/** Every gateway that could take a payment right now. */
export function configuredGateways(): GatewayName[] {
  return PREFERENCE.filter((name) => GATEWAYS[name].configured());
}

export type ActiveGateway = { name: GatewayName; label: string; provider: BillingProvider };

/** The gateway taking new payments, or null while no gateway has its keys. */
export function activeGateway(): ActiveGateway | null {
  const name = checkoutGatewayName();
  const gateway = GATEWAYS[name];
  if (!gateway.configured()) return null;
  return { name, label: gateway.label, provider: gateway.provider };
}

/** Whether a customer can pay online right now. */
export function checkoutAvailable(): boolean {
  return activeGateway() !== null;
}

export function requireActiveGateway(): ActiveGateway {
  const gateway = activeGateway();
  if (!gateway) {
    throw new DomainError(503, "billing_unconfigured", "Online payments are not set up on this platform yet.");
  }
  return gateway;
}

/** How a gateway is named to people. `MANUAL` is a payment staff recorded by hand. */
export function gatewayLabel(provider: PaymentProvider | GatewayName | null | undefined): string {
  if (!provider) return "—";
  if (provider === "MANUAL") return "Recorded by staff";
  return GATEWAYS[provider]?.label ?? provider;
}

/**
 * The gateway that took an EXISTING payment, for confirming it. Read from the
 * payment row, not from `activeGateway()`: a payment started on the old gateway
 * the day before a switch must still be confirmable the day after. Null when
 * the payment was not taken online, or its gateway's keys are gone.
 */
export function gatewayForPayment(provider: PaymentProvider): ActiveGateway | null {
  if (provider === "MANUAL") return null;
  const gateway = GATEWAYS[provider];
  if (!gateway || !gateway.configured()) return null;
  return { name: provider, label: gateway.label, provider: gateway.provider };
}

/* -------------------------------------------------------------------------- */
/* Payouts                                                                     */
/* -------------------------------------------------------------------------- */

/** The columns of `TenantSubaccount` that decide whether, and how, an academy is paid. */
export type PayoutAccount = {
  courseSalesEnabled: boolean;
  platformCommissionPct: number;
  monnifySubaccountCode: string | null;
  monnifyStatus: SubaccountStatus;
  paystackSubaccountCode: string | null;
  paystackStatus: SubaccountStatus;
  flutterwaveSubaccountId: string | null;
  flutterwaveStatus: SubaccountStatus;
};

export type PayoutSplit = NonNullable<Parameters<BillingProvider["initializeCheckout"]>[0]["subaccount"]>;

/** Where an academy's payout account stands on one gateway. */
export function payoutStatus(account: PayoutAccount | null | undefined, gateway: GatewayName): SubaccountStatus | "NOT_SET_UP" {
  if (!account) return "NOT_SET_UP";
  if (gateway === "MONNIFY") return account.monnifySubaccountCode ? account.monnifyStatus : notStarted(account.monnifyStatus);
  if (gateway === "PAYSTACK") return account.paystackSubaccountCode ? account.paystackStatus : notStarted(account.paystackStatus);
  return account.flutterwaveSubaccountId ? account.flutterwaveStatus : notStarted(account.flutterwaveStatus);
}

/** With no code on file, ACTIVE cannot be true whatever the column says. */
function notStarted(status: SubaccountStatus): SubaccountStatus {
  return status === "ACTIVE" ? "PENDING" : status;
}

/**
 * The split to send with a sale, or null when the academy cannot be paid
 * through this gateway yet.
 *
 * Null means "do not take the money", not "take it without a split": a sale
 * with no split lands whole in the platform's account, with nothing recording
 * that most of it belongs to someone else.
 */
export function payoutSplit(account: PayoutAccount | null | undefined, gateway: GatewayName, amountCents: number): PayoutSplit | null {
  if (!account || payoutStatus(account, gateway) !== "ACTIVE") return null;
  const commissionPct = account.platformCommissionPct;
  const split: PayoutSplit = {
    commissionPct,
    platformFeeCents: Math.round((amountCents * commissionPct) / 100),
  };
  if (gateway === "MONNIFY") split.monnifyCode = account.monnifySubaccountCode ?? undefined;
  if (gateway === "PAYSTACK") split.paystackCode = account.paystackSubaccountCode ?? undefined;
  if (gateway === "FLUTTERWAVE") split.flutterwaveId = account.flutterwaveSubaccountId ?? undefined;
  return split;
}

/**
 * The checks every paid sale by an academy must pass, in one place: sales are
 * switched on, and there is somewhere to send the academy's share.
 */
export function requireSaleSplit(
  account: PayoutAccount | null | undefined,
  gateway: ActiveGateway,
  amountCents: number
): PayoutSplit & { platformFeeCents: number } {
  if (!account?.courseSalesEnabled) {
    throw new DomainError(400, "sales_disabled", "Paid sales are not switched on for this academy.");
  }
  const split = payoutSplit(account, gateway.name, amountCents);
  if (!split) {
    throw new DomainError(
      400,
      "subaccount_inactive",
      "This academy cannot take payments yet — its payout account is still being set up."
    );
  }
  return { ...split, platformFeeCents: split.platformFeeCents ?? 0 };
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Turn a gateway failure into an error a route can return.
 *
 * `audience` decides how much is said. Staff setting up a payout account need
 * the gateway's own words ("account number does not match bank") to fix it. A
 * learner at a checkout can do nothing with "invalid contract code" — they get
 * something they can act on, and the detail goes to the log.
 */
export function gatewayError(err: unknown, audience: "customer" | "staff", context: string): DomainError {
  if (err instanceof DomainError) return err;

  if (err instanceof MonnifyError) {
    logger.error({ kind: err.kind, status: err.status, code: err.code, detail: err.message, context }, "gateway_error");
    if (err.kind === "not_configured") {
      return new DomainError(503, "billing_unconfigured", "Online payments are not set up on this platform yet.");
    }
    if (err.retryable) return new DomainError(503, "gateway_unavailable", err.message);
    if (audience === "staff") {
      return new DomainError(
        err.kind === "auth" ? 502 : 400,
        err.kind === "auth" ? "gateway_auth" : "gateway_rejected",
        err.kind === "auth"
          ? "Monnify did not accept the platform's API keys. Ask the platform administrator to check them."
          : err.message
      );
    }
    return new DomainError(
      502,
      "gateway_error",
      "We could not start your payment just now. Please try again in a few minutes."
    );
  }

  logger.error({ err, context }, "gateway_error");
  return new DomainError(
    502,
    "gateway_error",
    audience === "staff"
      ? err instanceof Error && err.message
        ? err.message
        : "The payment gateway returned an error."
      : "We could not start your payment just now. Please try again in a few minutes."
  );
}

/** Open a checkout on `gateway`, with failures already translated for whoever is paying. */
export async function startCheckout(
  gateway: ActiveGateway,
  input: Parameters<BillingProvider["initializeCheckout"]>[0],
  audience: "customer" | "staff" = "customer"
): Promise<CheckoutResult> {
  try {
    const checkout = await gateway.provider.initializeCheckout(input);
    // A learner buying through someone's referral link: remember who sent
    // them before they leave for the gateway. Never throws.
    const meta = input.metadata as { tenantId?: string; clientId?: string };
    if (meta.tenantId && meta.clientId) {
      await rememberCheckoutReferrer({
        tenantId: meta.tenantId,
        clientId: meta.clientId,
        cookieCode: await readReferralCookie(),
      });
    }
    return checkout;
  } catch (err) {
    // Nobody was sent to pay, so the row written for this reference is closed.
    await markCheckoutFailed(input.reference);
    throw gatewayError(err, audience, `checkout:${input.metadata.type}`);
  }
}
