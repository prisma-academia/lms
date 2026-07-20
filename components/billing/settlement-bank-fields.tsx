"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput, TextInput } from "@/components/form-field";

export type VerificationState = {
  verified: boolean;
  accountName: string | null;
};

type Props = {
  bankCode: string;
  accountNumber: string;
  onBankCodeChange: (value: string) => void;
  onAccountNumberChange: (value: string) => void;
  onVerificationChange: (state: VerificationState) => void;
  initialAccountName?: string | null;
  disabled?: boolean;
  bankFieldId?: string;
  accountFieldId?: string;
};

export function SettlementBankFields({
  bankCode,
  accountNumber,
  onBankCodeChange,
  onAccountNumberChange,
  onVerificationChange,
  initialAccountName,
  disabled = false,
  bankFieldId = "settlement-bank",
  accountFieldId = "settlement-account",
}: Props) {
  const [banks, setBanks] = useState<{ value: string; label: string }[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [banksUnavailable, setBanksUnavailable] = useState(false);

  const [verifiedAccountName, setVerifiedAccountName] = useState<string | null>(
    initialAccountName ?? null
  );
  const [verifiedFor, setVerifiedFor] = useState<{ bankCode: string; accountNumber: string } | null>(
    () => {
      const digits = accountNumber.replace(/\D/g, "");
      return initialAccountName && bankCode && digits.length === 10
        ? { bankCode, accountNumber: digits }
        : null;
    }
  );

  const [verifyPending, setVerifyPending] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const digitsOnly = accountNumber.replace(/\D/g, "");
  const canVerify = Boolean(bankCode && /^\d{10}$/.test(digitsOnly));
  const isVerified =
    Boolean(verifiedAccountName) &&
    verifiedFor?.bankCode === bankCode &&
    verifiedFor?.accountNumber === digitsOnly;

  function emitVerification(verified: boolean, accountName: string | null) {
    onVerificationChange({ verified, accountName });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBanksLoading(true);
      const res = await apiGet<{ banks: { code: string; name: string }[] }>(
        "/api/tenant/billing/banks"
      );
      if (cancelled) return;
      setBanksLoading(false);
      if (res.error) {
        setBanksUnavailable(true);
        return;
      }
      const list = res.data?.banks ?? [];
      setBanks(list.map((b) => ({ value: b.code, label: b.name })));
      setBanksUnavailable(list.length === 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function clearVerification() {
    setVerifiedAccountName(null);
    setVerifiedFor(null);
    setVerifyError(null);
    emitVerification(false, null);
  }

  function handleBankChange(value: string) {
    clearVerification();
    onBankCodeChange(value);
  }

  function handleAccountChange(value: string) {
    clearVerification();
    onAccountNumberChange(value.replace(/\D/g, "").slice(0, 10));
  }

  async function verifyAccount() {
    if (!canVerify) return;
    setVerifyError(null);
    setVerifyPending(true);
    const res = await apiPost<{ accountName: string }>("/api/tenant/billing/resolve-account", {
      settlementBankCode: bankCode,
      settlementAccountNumber: digitsOnly,
    });
    setVerifyPending(false);
    if (res.error) {
      setVerifyError(res.error.message);
      return;
    }
    const name = res.data?.accountName ?? null;
    if (!name) {
      setVerifyError("Could not resolve account name.");
      return;
    }
    setVerifiedAccountName(name);
    setVerifiedFor({ bankCode, accountNumber: digitsOnly });
    emitVerification(true, name);
  }

  return (
    <div className="flex flex-col gap-4">
      <FormField label="Bank" htmlFor={bankFieldId}>
        <SelectInput
          id={bankFieldId}
          options={banks}
          optionKey={(opt) => `${opt.value}::${opt.label}`}
          value={bankCode}
          onChange={(e) => handleBankChange(e.target.value)}
          disabled={disabled || banksLoading}
          placeholder={banksLoading ? "Loading banks…" : "Select a bank"}
        />
        {banksUnavailable && !banksLoading ? (
          <span className="text-xs font-medium text-muted-foreground">
            Bank verification requires Paystack or Flutterwave keys to be configured.
          </span>
        ) : null}
      </FormField>

      <FormField label="Account number" htmlFor={accountFieldId}>
        <TextInput
          id={accountFieldId}
          inputMode="numeric"
          maxLength={10}
          value={accountNumber}
          onChange={(e) => handleAccountChange(e.target.value)}
          disabled={disabled}
          placeholder="10-digit account number"
        />
      </FormField>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={verifyAccount}
          disabled={disabled || !canVerify || verifyPending || banksUnavailable}
        >
          {verifyPending ? "Verifying…" : "Verify account"}
        </Button>

        {isVerified && verifiedAccountName ? (
          <p className="rounded-[10px] border-2 border-green-700/30 bg-green-50 px-3.5 py-2.5 text-sm font-medium text-green-800">
            Account name: {verifiedAccountName}
          </p>
        ) : null}

        {verifyError ? <p className="text-sm text-red-600">{verifyError}</p> : null}
      </div>
    </div>
  );
}
