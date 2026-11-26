import { DomainError } from "@/lib/api/errors";
import { listFlutterwaveBanks, resolveFlutterwaveAccount } from "./flutterwave";
import { listMonnifyBanks, resolveMonnifyAccount } from "./monnify";
import { listPaystackBanks, resolvePaystackAccount } from "./paystack";
import { activeGateway, gatewayError } from "./providers";

export type SettlementBank = { code: string; name: string };

/**
 * Banks an academy can be paid into, as the gateway in use knows them.
 *
 * It has to be the SAME gateway that will later create the payout account:
 * bank codes are not portable between gateways for the smaller banks, so a
 * code picked from one list can be meaningless to another.
 */
export async function listSettlementBanks(): Promise<SettlementBank[]> {
  const gateway = activeGateway();
  if (!gateway) return [];

  let banks: Array<{ code: string; name: string }>;
  try {
    banks =
      gateway.name === "MONNIFY"
        ? await listMonnifyBanks()
        : gateway.name === "PAYSTACK"
          ? await listPaystackBanks()
          : await listFlutterwaveBanks();
  } catch (err) {
    throw gatewayError(err, "staff", "banks:list");
  }

  // A bank can appear twice in a gateway's list; a <select> cannot.
  const byCode = new Map<string, SettlementBank>();
  for (const b of banks) if (!byCode.has(b.code)) byCode.set(b.code, { code: b.code, name: b.name });
  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveSettlementAccount(input: {
  bankCode: string;
  accountNumber: string;
}): Promise<{ accountName: string }> {
  const gateway = activeGateway();
  if (!gateway) {
    throw new DomainError(
      503,
      "billing_unavailable",
      "Bank accounts cannot be verified until online payments are set up on this platform."
    );
  }

  try {
    if (gateway.name === "MONNIFY") return await resolveMonnifyAccount(input);
    if (gateway.name === "PAYSTACK") return await resolvePaystackAccount(input);
    return await resolveFlutterwaveAccount(input);
  } catch (err) {
    const mapped = gatewayError(err, "staff", "banks:resolve");
    // A gateway saying "no such account" is the user's typo, not a gateway
    // fault: answer it as a form error they can correct.
    if (mapped.code === "gateway_rejected" || mapped.code === "gateway_error") {
      throw new DomainError(400, "account_resolve_failed", mapped.message || "Could not verify this bank account.");
    }
    throw mapped;
  }
}
