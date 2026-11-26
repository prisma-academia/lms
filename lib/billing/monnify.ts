import crypto from "node:crypto";
import { env, monnifyConfigured } from "@/lib/env";
import type { BillingProvider, WebhookEvent } from "./types";

/**
 * Monnify (https://developers.monnify.com) — collections, sub-accounts and
 * bank utilities.
 *
 * Three things about Monnify shape everything below:
 *
 *  1. Amounts are in NAIRA, as decimals. Everything else in this codebase is in
 *     kobo, as integers. The two conversions live here and nowhere else.
 *  2. Every call needs a bearer token bought with the API key and secret, valid
 *     for an hour. It is cached in memory and refreshed a little early.
 *  3. Monnify does not hand our metadata back in a form worth trusting, and it
 *     only sends a webhook for SUCCESS. So what was bought is always read from
 *     our own payment row, and "not paid" is found out by asking.
 */

/** Monnify's own floor for a card or transfer collection. */
export const MONNIFY_MIN_AMOUNT_CENTS = 20_00;

const TIMEOUT_MS = 15_000;
/** Refresh this long before the token's stated expiry, to absorb clock skew and slow calls. */
const TOKEN_SAFETY_MS = 60_000;

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

export type MonnifyErrorKind =
  /** Keys or contract code missing from the environment. */
  | "not_configured"
  /** Monnify refused our API key / secret. */
  | "auth"
  /** Monnify understood the request and said no (bad account, feature off, …). */
  | "rejected"
  | "timeout"
  /** Network failure or a 5xx: nothing wrong with the request itself. */
  | "unavailable"
  /** A reply we could not read as a Monnify envelope. */
  | "bad_response";

/**
 * `message` is written to be shown to a person. It never contains a key, a
 * token, or a request body — only what Monnify said, or what went wrong.
 */
export class MonnifyError extends Error {
  kind: MonnifyErrorKind;
  /** HTTP status, when there was a response. */
  status: number | null;
  /** Monnify's `responseCode`, when it sent one. */
  code: string | null;

  constructor(kind: MonnifyErrorKind, message: string, status: number | null = null, code: string | null = null) {
    super(message);
    this.name = "MonnifyError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }

  /** Worth trying again without changing anything. */
  get retryable(): boolean {
    return this.kind === "timeout" || this.kind === "unavailable";
  }
}

/* -------------------------------------------------------------------------- */
/* Money                                                                       */
/* -------------------------------------------------------------------------- */

/** Kobo to the decimal naira Monnify expects: 250050 -> 2500.5. */
export function koboToNaira(amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new MonnifyError("rejected", "The amount to charge is not a valid sum of money.");
  }
  return amountCents / 100;
}

/**
 * Monnify's naira figure ("2500.50", 2500.5, "2,500.50") to kobo.
 *
 * Parsed as text rather than multiplied as a float: 1.15 * 100 is
 * 114.99999999999999 in binary, and a payment check that is off by a kobo
 * either refuses a customer who paid in full or accepts one who did not.
 * Returns null for anything that is not a plain non-negative amount.
 */
export function nairaToKobo(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  // toFixed(4), not String(): a number can only be here because JSON carried
  // it, and 4 places is more than any currency amount while short enough to
  // shed the binary dust on something like 0.1 + 0.2.
  const text = (typeof value === "number" ? value.toFixed(4) : value).trim().replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(3, "0");
  const kobo = Number(match[1]) * 100 + Number(fraction.slice(0, 2));
  // Monnify quotes two decimal places. A third only appears if a figure was
  // computed somewhere upstream, and then it rounds the ordinary way.
  const rounded = Number(fraction[2]) >= 5 ? kobo + 1 : kobo;
  return Number.isSafeInteger(rounded) ? rounded : null;
}

/* -------------------------------------------------------------------------- */
/* HTTP                                                                        */
/* -------------------------------------------------------------------------- */

type Envelope<T> = {
  requestSuccessful?: boolean;
  responseMessage?: string;
  responseCode?: string | number;
  responseBody?: T;
};

function requireConfig() {
  if (!monnifyConfigured()) {
    throw new MonnifyError(
      "not_configured",
      "Monnify is not set up: MONNIFY_API_KEY, MONNIFY_SECRET_KEY and MONNIFY_CONTRACT_CODE are required."
    );
  }
  return {
    apiKey: env.MONNIFY_API_KEY as string,
    secretKey: env.MONNIFY_SECRET_KEY as string,
    contractCode: env.MONNIFY_CONTRACT_CODE as string,
    baseUrl: env.MONNIFY_BASE_URL.replace(/\/+$/, ""),
  };
}

/** One HTTP exchange with Monnify, reduced to its `responseBody` or a `MonnifyError`. */
async function send<T>(path: string, init: RequestInit & { headers: Record<string, string> }): Promise<T> {
  const { baseUrl } = requireConfig();

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new MonnifyError("timeout", "Monnify took too long to respond. Please try again.");
    }
    throw new MonnifyError("unavailable", "Could not reach Monnify. Please try again in a moment.");
  }

  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    // Not JSON: a gateway error page, or an empty body. Classified by status below.
  }

  if (res.ok && json?.requestSuccessful === true) {
    return json.responseBody as T;
  }

  const said = typeof json?.responseMessage === "string" ? json.responseMessage.trim() : "";
  const code = json?.responseCode != null ? String(json.responseCode) : null;

  if (res.status === 401 || res.status === 403) {
    throw new MonnifyError("auth", said || "Monnify did not accept the API credentials.", res.status, code);
  }
  if (res.status >= 500) {
    throw new MonnifyError("unavailable", "Monnify is having trouble right now. Please try again shortly.", res.status, code);
  }
  if (!json) {
    throw new MonnifyError("bad_response", "Monnify sent a reply that could not be read.", res.status, code);
  }
  throw new MonnifyError("rejected", said || "Monnify declined the request.", res.status, code);
}

/* -------------------------------------------------------------------------- */
/* Access token                                                                */
/* -------------------------------------------------------------------------- */

type CachedToken = { token: string; expiresAt: number; forKey: string };

let cached: CachedToken | null = null;
/** A login already in flight, shared so a burst of requests buys one token, not twenty. */
let pending: Promise<string> | null = null;

/** Forget the cached token. For tests, and for after the keys are rotated. */
export function resetMonnifyTokenCache(): void {
  cached = null;
  pending = null;
}

async function login(): Promise<string> {
  const { apiKey, secretKey } = requireConfig();
  const basic = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");
  const body = await send<{ accessToken?: string; expiresIn?: number }>("/api/v1/auth/login", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
  });
  if (!body?.accessToken) {
    throw new MonnifyError("bad_response", "Monnify signed us in but sent no access token.");
  }
  // A missing or silly `expiresIn` must not turn into a token cached forever.
  const lifetimeMs = Math.max(0, Math.min(Number(body.expiresIn) || 0, 3600)) * 1000;
  cached = { token: body.accessToken, expiresAt: Date.now() + lifetimeMs, forKey: apiKey };
  return body.accessToken;
}

async function accessToken(): Promise<string> {
  const { apiKey } = requireConfig();
  if (cached && cached.forKey === apiKey && Date.now() < cached.expiresAt - TOKEN_SAFETY_MS) {
    return cached.token;
  }
  if (!pending) {
    pending = login().finally(() => {
      pending = null;
    });
  }
  return pending;
}

/** An authenticated call. A token Monnify has stopped accepting is replaced once, then the call is repeated. */
async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" }): Promise<T> {
  const attempt = async () =>
    send<T>(path, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });

  try {
    return await attempt();
  } catch (err) {
    if (err instanceof MonnifyError && err.kind === "auth" && cached) {
      // Revoked or expired early on their side. Our cache is the stale thing.
      resetMonnifyTokenCache();
      return attempt();
    }
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Transactions                                                                */
/* -------------------------------------------------------------------------- */

export type MonnifyPaymentStatus =
  | "PAID"
  | "OVERPAID"
  | "PARTIALLY_PAID"
  | "PENDING"
  | "ABANDONED"
  | "CANCELLED"
  | "FAILED"
  | "REVERSED"
  | "EXPIRED";

/** The statuses in which the customer has paid at least what was asked. */
const SETTLED: ReadonlySet<string> = new Set(["PAID", "OVERPAID"]);

type TransactionBody = {
  transactionReference?: string;
  paymentReference?: string;
  amountPaid?: string | number;
  totalPayable?: string | number;
  paymentStatus?: string;
  currency?: string;
  currencyCode?: string;
};

export type MonnifyTransaction = {
  reference: string;
  status: string;
  /** Kobo. Null when Monnify's figure could not be read — treat as unpaid. */
  amountPaidCents: number | null;
  currency: string;
  raw: unknown;
};

function normalizeTransaction(body: TransactionBody | null | undefined): MonnifyTransaction | null {
  if (!body || typeof body.paymentReference !== "string" || !body.paymentReference) return null;
  return {
    reference: body.paymentReference,
    status: typeof body.paymentStatus === "string" ? body.paymentStatus.toUpperCase() : "",
    amountPaidCents: nairaToKobo(body.amountPaid),
    currency: String(body.currency ?? body.currencyCode ?? "").toUpperCase(),
    raw: body,
  };
}

function toEvent(tx: MonnifyTransaction | null): WebhookEvent | null {
  if (!tx || !SETTLED.has(tx.status) || tx.amountPaidCents == null) return null;
  return {
    reference: tx.reference,
    status: "success",
    amountCents: tx.amountPaidCents,
    currency: tx.currency,
    raw: tx.raw,
  };
}

/**
 * Ask Monnify what happened to a payment, by OUR reference. Returns null when
 * Monnify has no such transaction — which is an answer, not an error: a
 * checkout that was never opened leaves nothing behind.
 */
export async function queryMonnifyTransaction(reference: string): Promise<MonnifyTransaction | null> {
  const params = new URLSearchParams({ paymentReference: reference });
  try {
    const body = await call<TransactionBody>(`/api/v2/merchant/transactions/query?${params}`);
    const tx = normalizeTransaction(body);
    // A reply about some other payment is not an answer to this question.
    return tx && tx.reference === reference ? tx : null;
  } catch (err) {
    // Matched narrowly on purpose. Monnify reuses one generic response code for
    // most refusals, so keying on that would report a broken contract code as
    // "customer has not paid yet" and hide it indefinitely.
    if (
      err instanceof MonnifyError &&
      err.kind === "rejected" &&
      (err.status === 404 || /no transaction|could not be found|not found/i.test(err.message))
    ) {
      return null;
    }
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Webhook                                                                     */
/* -------------------------------------------------------------------------- */

/** The value Monnify puts in `monnify-signature`: HMAC-SHA512 of the raw body, hex. */
export function monnifySignature(rawBody: string, secretKey: string): string {
  return crypto.createHmac("sha512", secretKey).update(rawBody, "utf8").digest("hex");
}

/**
 * Whether `signature` is the one Monnify would have sent for exactly these
 * bytes. Compared in constant time, and anything that is not 128 hex characters
 * is refused before the comparison rather than being allowed to throw in it.
 */
export function verifyMonnifySignature(rawBody: string, signature: string | null | undefined, secretKey: string): boolean {
  if (!signature || !secretKey) return false;
  const given = signature.trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(given)) return false;
  const expected = monnifySignature(rawBody, secretKey);
  return crypto.timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

/**
 * Read a webhook body that has ALREADY passed the signature check. Only a
 * successful collection is of interest; refunds, disbursements and settlements
 * arrive on the same URL and are not ours to act on.
 */
export function parseMonnifyWebhook(rawBody: string): WebhookEvent | null {
  let payload: { eventType?: unknown; eventData?: TransactionBody };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return null;
  }
  if (payload?.eventType !== "SUCCESSFUL_TRANSACTION") return null;
  return toEvent(normalizeTransaction(payload.eventData));
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/* -------------------------------------------------------------------------- */

export const monnifyProvider: BillingProvider = {
  async initializeCheckout(input) {
    const { contractCode } = requireConfig();
    if (input.amountCents < MONNIFY_MIN_AMOUNT_CENTS) {
      throw new MonnifyError("rejected", "The smallest amount that can be paid online is ₦20.");
    }

    const body: Record<string, unknown> = {
      amount: koboToNaira(input.amountCents),
      customerName: input.customerName?.trim() || input.email,
      customerEmail: input.email,
      paymentReference: input.reference,
      paymentDescription: (input.description?.trim() || "Payment").slice(0, 200),
      currencyCode: input.currency.toUpperCase(),
      contractCode,
      redirectUrl: input.callbackUrl,
      // For the merchant's own reconciliation in the Monnify dashboard. Nothing
      // here is read back: fulfilment works from our payment row.
      metadata: input.metadata,
    };

    const sub = input.subaccount;
    if (sub?.monnifyCode) {
      const commission = Math.min(100, Math.max(0, sub.commissionPct ?? 0));
      body.incomeSplitConfig = [
        {
          subAccountCode: sub.monnifyCode,
          // The academy's share. What is left stays in the platform's wallet.
          splitPercentage: 100 - commission,
          // Monnify's own fee comes out of the platform's share, so an academy
          // always receives exactly the percentage it was promised.
          feePercentage: 0,
          feeBearer: false,
        },
      ];
    }

    const data = await call<{ checkoutUrl?: string }>("/api/v1/merchant/transactions/init-transaction", {
      method: "POST",
      body,
    });
    if (!data?.checkoutUrl) {
      throw new MonnifyError("bad_response", "Monnify accepted the payment but sent no checkout page.");
    }
    return { authorizationUrl: data.checkoutUrl, reference: input.reference };
  },

  /**
   * Authenticates the webhook and reads it. The event returned is Monnify's
   * CLAIM that a payment succeeded; the webhook route confirms it with
   * `verifyTransaction` before anything is fulfilled.
   */
  async verifyWebhook(request) {
    if (!monnifyConfigured()) return null;
    const rawBody = await request.text();
    const signature = request.headers.get("monnify-signature");
    if (!verifyMonnifySignature(rawBody, signature, env.MONNIFY_SECRET_KEY as string)) return null;
    return parseMonnifyWebhook(rawBody);
  },

  async verifyTransaction(reference) {
    if (!monnifyConfigured()) return null;
    return toEvent(await queryMonnifyTransaction(reference));
  },
};

/* -------------------------------------------------------------------------- */
/* Sub-accounts and banks                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Register the bank account an academy is paid into. `splitPercentage` is the
 * ACADEMY'S share of each sale and becomes the sub-account's default; every
 * checkout states the split again, so a later change of commission does not
 * depend on updating this.
 *
 * Sub-accounts are a feature Monnify switches on per merchant. Until it has,
 * this fails with `kind: "rejected"` and Monnify's own explanation.
 */
export async function createMonnifySubaccount(input: {
  bankCode: string;
  accountNumber: string;
  email: string;
  splitPercentage: number;
  currency?: string;
}): Promise<{ subAccountCode: string; accountName: string | null }> {
  const created = await call<Array<{ subAccountCode?: string; accountName?: string }>>("/api/v1/sub-accounts", {
    method: "POST",
    // The endpoint takes a list; we create one at a time.
    body: [
      {
        currencyCode: (input.currency ?? "NGN").toUpperCase(),
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
        email: input.email,
        defaultSplitPercentage: input.splitPercentage,
      },
    ],
  });
  const first = Array.isArray(created) ? created[0] : null;
  if (!first?.subAccountCode) {
    throw new MonnifyError("bad_response", "Monnify did not return a sub-account code.");
  }
  return { subAccountCode: first.subAccountCode, accountName: first.accountName ?? null };
}

/**
 * Sub-accounts already registered under this merchant. Used for one thing:
 * recognising a sub-account that exists at Monnify but whose code we never
 * stored, so that an academy is not stuck on "already exists" forever.
 */
export async function listMonnifySubaccounts(): Promise<
  Array<{ subAccountCode: string; accountNumber: string; bankCode: string; accountName: string | null }>
> {
  const rows = await call<
    Array<{ subAccountCode?: string; accountNumber?: string; bankCode?: string; accountName?: string }>
  >("/api/v1/sub-accounts");
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r?.subAccountCode && r.accountNumber && r.bankCode)
    .map((r) => ({
      subAccountCode: r.subAccountCode as string,
      accountNumber: r.accountNumber as string,
      bankCode: r.bankCode as string,
      accountName: r.accountName ?? null,
    }));
}

export async function listMonnifyBanks(): Promise<Array<{ name: string; code: string; provider: "monnify" }>> {
  if (!monnifyConfigured()) return [];
  const banks = await call<Array<{ name?: string; code?: string }>>("/api/v1/banks");
  return (Array.isArray(banks) ? banks : [])
    .filter((b): b is { name: string; code: string } => Boolean(b?.name && b?.code))
    .map((b) => ({ name: b.name, code: b.code, provider: "monnify" as const }));
}

export async function resolveMonnifyAccount(input: {
  bankCode: string;
  accountNumber: string;
}): Promise<{ accountName: string }> {
  const params = new URLSearchParams({ accountNumber: input.accountNumber, bankCode: input.bankCode });
  const data = await call<{ accountName?: string }>(`/api/v2/disbursements/account/validate?${params}`);
  if (!data?.accountName) {
    throw new MonnifyError("rejected", "That account number was not found at the selected bank.");
  }
  return { accountName: data.accountName };
}
