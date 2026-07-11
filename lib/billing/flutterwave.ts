import crypto from "node:crypto";
import { env, flutterwaveConfigured } from "@/lib/env";
import type { BillingProvider, PaymentMetadata } from "./types";

const BASE = "https://api.flutterwave.com/v3";

async function flutterwaveFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json()) as { status: string; message: string; data: T };
  if (json.status !== "success") throw new Error(json.message || "Flutterwave API error");
  return json.data;
}

export const flutterwaveProvider: BillingProvider = {
  async initializeCheckout(input) {
    if (!flutterwaveConfigured()) throw new Error("Flutterwave is not configured.");
    const body: Record<string, unknown> = {
      tx_ref: input.reference,
      amount: input.amountCents / 100,
      currency: input.currency,
      redirect_url: input.callbackUrl,
      customer: { email: input.email },
      meta: input.metadata,
    };
    if (input.subaccount?.flutterwaveId) {
      body.subaccounts = [{ id: input.subaccount.flutterwaveId }];
    }
    const data = await flutterwaveFetch<{ link: string }>("/payments", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { authorizationUrl: data.link, reference: input.reference };
  },

  async verifyWebhook(request) {
    if (!flutterwaveConfigured()) return null;
    const signature = request.headers.get("verif-hash");
    const secretHash = env.FLUTTERWAVE_SECRET_HASH;
    if (!signature || !secretHash || signature !== secretHash) return null;
    const payload = (await request.json()) as {
      event: string;
      data: {
        tx_ref: string;
        status: string;
        amount: number;
        currency: string;
        meta?: PaymentMetadata;
      };
    };
    if (payload.event !== "charge.completed") return null;
    const meta = payload.data.meta;
    if (!meta?.type) return null;
    return {
      reference: payload.data.tx_ref,
      status: payload.data.status === "successful" ? "success" : "failed",
      amountCents: Math.round(payload.data.amount * 100),
      currency: payload.data.currency,
      metadata: meta,
      raw: payload,
    };
  },
};

export async function createFlutterwaveSubaccount(input: {
  businessName: string;
  businessEmail?: string;
  businessMobile?: string;
  settlementBankCode: string;
  accountNumber: string;
  splitValue: number;
}) {
  if (!flutterwaveConfigured()) throw new Error("Flutterwave is not configured.");
  return flutterwaveFetch<{
    subaccount_id: string;
    account_number: string;
    full_name: string;
  }>("/subaccounts", {
    method: "POST",
    body: JSON.stringify({
      account_bank: input.settlementBankCode,
      account_number: input.accountNumber,
      business_name: input.businessName,
      business_email: input.businessEmail,
      business_mobile: input.businessMobile,
      country: "NG",
      split_type: "percentage",
      split_value: input.splitValue,
    }),
  });
}

export async function listFlutterwaveBanks() {
  if (!flutterwaveConfigured()) return [];
  const data = await flutterwaveFetch<Array<{ name: string; code: string }>>("/banks/NG");
  return data.map((b) => ({ name: b.name, code: b.code, provider: "flutterwave" as const }));
}

export async function resolveFlutterwaveAccount(input: {
  bankCode: string;
  accountNumber: string;
}) {
  if (!flutterwaveConfigured()) throw new Error("Flutterwave is not configured.");
  const data = await flutterwaveFetch<{ account_name: string }>("/accounts/resolve", {
    method: "POST",
    body: JSON.stringify({
      account_bank: input.bankCode,
      account_number: input.accountNumber,
    }),
  });
  return { accountName: data.account_name };
}

export function flutterwaveReference(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}
