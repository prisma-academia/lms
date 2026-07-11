import crypto from "node:crypto";
import { env, paystackConfigured } from "@/lib/env";
import type { BillingProvider, PaymentMetadata } from "./types";

const BASE = "https://api.paystack.co";

async function paystackFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json()) as { status: boolean; message: string; data: T };
  if (!json.status) throw new Error(json.message || "Paystack API error");
  return json.data;
}

export const paystackProvider: BillingProvider = {
  async initializeCheckout(input) {
    if (!paystackConfigured()) throw new Error("Paystack is not configured.");
    const body: Record<string, unknown> = {
      email: input.email,
      amount: input.amountCents,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    };
    if (input.subaccount?.paystackCode) {
      body.subaccount = input.subaccount.paystackCode;
      if (input.subaccount.platformFeeCents != null) {
        body.transaction_charge = input.subaccount.platformFeeCents;
      }
    }
    const data = await paystackFetch<{ authorization_url: string; reference: string }>(
      "/transaction/initialize",
      { method: "POST", body: JSON.stringify(body) }
    );
    return { authorizationUrl: data.authorization_url, reference: data.reference };
  },

  async verifyWebhook(request) {
    if (!paystackConfigured()) return null;
    const signature = request.headers.get("x-paystack-signature");
    const rawBody = await request.text();
    if (!signature || !env.PAYSTACK_SECRET_KEY) return null;
    const hash = crypto.createHmac("sha512", env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
    if (hash !== signature) return null;
    const payload = JSON.parse(rawBody) as {
      event: string;
      data: {
        reference: string;
        status: string;
        amount: number;
        currency: string;
        metadata?: PaymentMetadata;
      };
    };
    if (payload.event !== "charge.success") return null;
    const meta = payload.data.metadata;
    if (!meta?.type) return null;
    return {
      reference: payload.data.reference,
      status: payload.data.status === "success" ? "success" : "failed",
      amountCents: payload.data.amount,
      currency: payload.data.currency,
      metadata: meta,
      raw: payload,
    };
  },
};

export async function createPaystackSubaccount(input: {
  businessName: string;
  settlementBankCode: string;
  accountNumber: string;
  percentageCharge: number;
  primaryContactEmail?: string;
}) {
  if (!paystackConfigured()) throw new Error("Paystack is not configured.");
  return paystackFetch<{
    subaccount_code: string;
    account_name: string;
    active: boolean;
  }>("/subaccount", {
    method: "POST",
    body: JSON.stringify({
      business_name: input.businessName,
      settlement_bank: input.settlementBankCode,
      account_number: input.accountNumber,
      percentage_charge: input.percentageCharge,
      primary_contact_email: input.primaryContactEmail,
    }),
  });
}

export async function listPaystackBanks() {
  if (!paystackConfigured()) return [];
  const data = await paystackFetch<Array<{ name: string; code: string }>>("/bank?country=nigeria");
  return data.map((b) => ({ name: b.name, code: b.code, provider: "paystack" as const }));
}

export async function resolvePaystackAccount(input: {
  bankCode: string;
  accountNumber: string;
}) {
  if (!paystackConfigured()) throw new Error("Paystack is not configured.");
  const params = new URLSearchParams({
    account_number: input.accountNumber,
    bank_code: input.bankCode,
  });
  const data = await paystackFetch<{ account_name: string }>(`/bank/resolve?${params}`);
  return { accountName: data.account_name };
}
