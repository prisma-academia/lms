import { DomainError } from "@/lib/api/errors";
import { billingConfigured, paystackConfigured } from "@/lib/env";
import { listFlutterwaveBanks, resolveFlutterwaveAccount } from "./flutterwave";
import { listPaystackBanks, resolvePaystackAccount } from "./paystack";

export type SettlementBank = { code: string; name: string };

function billingUnavailable(): never {
  throw new DomainError(
    503,
    "billing_unavailable",
    "Bank verification requires Paystack or Flutterwave keys to be configured."
  );
}

export async function listSettlementBanks(): Promise<SettlementBank[]> {
  if (!billingConfigured()) return [];

  const banks = paystackConfigured()
    ? await listPaystackBanks()
    : await listFlutterwaveBanks();

  return banks
    .map((b) => ({ code: b.code, name: b.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveSettlementAccount(input: {
  bankCode: string;
  accountNumber: string;
}): Promise<{ accountName: string }> {
  if (!billingConfigured()) billingUnavailable();

  try {
    if (paystackConfigured()) {
      return await resolvePaystackAccount(input);
    }
    return await resolveFlutterwaveAccount(input);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not verify this bank account.";
    throw new DomainError(400, "account_resolve_failed", message);
  }
}
