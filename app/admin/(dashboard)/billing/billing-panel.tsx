"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput, TextInput } from "@/components/form-field";
import {
  SettlementBankFields,
  type VerificationState,
} from "@/components/billing/settlement-bank-fields";

type BillingSnapshot = {
  plan: string;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  subscriptionStatus: string;
  subscriptionEndsAt: string | null;
  storageUsedLabel: string;
  storageQuotaLabel: string;
  storagePercent: number;
  currentPlan: {
    id: string;
    name: string;
    code: string;
    priceMonthlyCents: number;
    currency: string;
  } | null;
};

type PlanRow = {
  id: string;
  name: string;
  code: string;
  priceMonthlyCents: number;
  currency: string;
  storageQuotaLabel: string;
  maxLearners: number | null;
  maxCourses: number | null;
};

type SubaccountSnapshot = {
  businessName: string;
  businessEmail: string | null;
  businessPhone: string | null;
  settlementBankCode: string;
  settlementAccountNumber: string;
  settlementAccountName: string | null;
  courseSalesEnabled: boolean;
  defaultProvider: "paystack" | "flutterwave" | null;
  paystackStatus: string;
  flutterwaveStatus: string;
};

type PaymentRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  createdAt: string;
};

export function BillingPanel({
  billing,
  plans,
  subaccount,
  payments,
}: {
  billing: BillingSnapshot | null;
  plans: PlanRow[];
  subaccount: SubaccountSnapshot | null;
  payments: PaymentRow[];
}) {
  const [checkoutProvider, setCheckoutProvider] = useState<"paystack" | "flutterwave">(
    "paystack"
  );
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutPending, setCheckoutPending] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState(subaccount?.businessName ?? "");
  const [businessEmail, setBusinessEmail] = useState(subaccount?.businessEmail ?? "");
  const [businessPhone, setBusinessPhone] = useState(subaccount?.businessPhone ?? "");
  const [bankCode, setBankCode] = useState(subaccount?.settlementBankCode ?? "");
  const [accountNumber, setAccountNumber] = useState(
    subaccount?.settlementAccountNumber ?? ""
  );
  const [defaultProvider, setDefaultProvider] = useState<"" | "paystack" | "flutterwave">(
    subaccount?.defaultProvider ?? ""
  );
  const [courseSalesEnabled, setCourseSalesEnabled] = useState(
    subaccount?.courseSalesEnabled ?? false
  );
  const [subaccountError, setSubaccountError] = useState<string | null>(null);
  const [subaccountInfo, setSubaccountInfo] = useState<string | null>(null);
  const [subaccountPending, setSubaccountPending] = useState(false);
  const [verification, setVerification] = useState<VerificationState>(() => ({
    verified: Boolean(
      subaccount?.settlementAccountName &&
        subaccount.settlementBankCode &&
        subaccount.settlementAccountNumber
    ),
    accountName: subaccount?.settlementAccountName ?? null,
  }));

  async function startCheckout(planId: string) {
    setCheckoutError(null);
    setCheckoutPending(planId);
    const res = await apiPost<{ checkoutUrl: string }>("/api/tenant/billing/checkout", {
      planId,
      provider: checkoutProvider,
    });
    setCheckoutPending(null);
    if (res.error) {
      setCheckoutError(res.error.message);
      return;
    }
    if (res.data?.checkoutUrl) {
      window.location.href = res.data.checkoutUrl;
    }
  }

  async function saveSubaccount(e: React.FormEvent) {
    e.preventDefault();
    setSubaccountError(null);
    setSubaccountInfo(null);
    if (!verification.verified) {
      setSubaccountError("Verify the bank account before saving.");
      return;
    }
    setSubaccountPending(true);
    const res = await apiPost("/api/tenant/billing/subaccount", {
      businessName: businessName.trim(),
      businessEmail: businessEmail.trim() || undefined,
      businessPhone: businessPhone.trim() || undefined,
      settlementBankCode: bankCode.trim(),
      settlementAccountNumber: accountNumber.trim(),
      defaultProvider: defaultProvider || undefined,
      courseSalesEnabled,
    });
    setSubaccountPending(false);
    if (res.error) {
      setSubaccountError(res.error.message);
      return;
    }
    setSubaccountInfo("Settlement details saved. Provisioning may take a moment.");
  }

  if (!billing) {
    return <p className="text-sm text-stone-600">Billing information unavailable.</p>;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <section>
        <h2 className="text-sm font-semibold uppercase text-stone-500">Current plan</h2>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-stone-500">Plan</dt>
          <dd>{billing.currentPlan?.name ?? billing.plan}</dd>
          <dt className="text-stone-500">Subscription status</dt>
          <dd>{billing.subscriptionStatus}</dd>
          {billing.trialDaysLeft != null ? (
            <>
              <dt className="text-stone-500">Trial days left</dt>
              <dd>{billing.trialDaysLeft}</dd>
            </>
          ) : null}
          {billing.trialEndsAt ? (
            <>
              <dt className="text-stone-500">Trial ends</dt>
              <dd>{new Date(billing.trialEndsAt).toLocaleDateString()}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-stone-500">Storage</h2>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-sm">
            <span>
              {billing.storageUsedLabel} / {billing.storageQuotaLabel}
            </span>
            <span>{billing.storagePercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-stone-800"
              style={{ width: `${billing.storagePercent}%` }}
            />
          </div>
        </div>
      </section>

      {plans.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold uppercase text-stone-500">Upgrade</h2>
          <div className="mt-4 flex flex-col gap-2">
            <FormField label="Payment provider" htmlFor="checkout-provider">
              <SelectInput
                id="checkout-provider"
                allowEmpty={false}
                options={[
                  { value: "paystack", label: "Paystack" },
                  { value: "flutterwave", label: "Flutterwave" },
                ]}
                value={checkoutProvider}
                onChange={(e) =>
                  setCheckoutProvider(e.target.value as "paystack" | "flutterwave")
                }
              />
            </FormField>
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {plans.map((plan) => (
              <li
                key={plan.id}
                className="flex items-center justify-between rounded border border-stone-200 bg-stone-50 p-4 text-sm"
              >
                <div>
                  <div className="font-medium">{plan.name}</div>
                  <div className="mt-1 text-xs text-stone-500">
                    {plan.currency} {(plan.priceMonthlyCents / 100).toLocaleString()}/mo ·{" "}
                    {plan.storageQuotaLabel} storage
                    {plan.maxCourses != null ? ` · up to ${plan.maxCourses} courses` : ""}
                  </div>
                </div>
                <Button
                  onClick={() => startCheckout(plan.id)}
                  disabled={checkoutPending === plan.id}
                >
                  {checkoutPending === plan.id ? "Starting…" : "Upgrade"}
                </Button>
              </li>
            ))}
          </ul>
          {checkoutError ? <p className="mt-2 text-sm text-red-600">{checkoutError}</p> : null}
        </section>
      ) : null}

      {payments.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold uppercase text-stone-500">Recent payments</h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between text-stone-700">
                <span>
                  {p.currency} {(p.amountCents / 100).toLocaleString()} · {p.provider} ·{" "}
                  {p.status}
                </span>
                <span className="text-xs text-stone-500">
                  {new Date(p.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold uppercase text-stone-500">Payout subaccount</h2>
        {subaccount ? (
          <p className="mt-2 text-xs text-stone-500">
            Paystack: {subaccount.paystackStatus} · Flutterwave: {subaccount.flutterwaveStatus}
            {subaccount.settlementAccountName
              ? ` · Account name: ${subaccount.settlementAccountName}`
              : ""}
          </p>
        ) : null}
        <form onSubmit={saveSubaccount} className="mt-4 flex flex-col gap-4">
          <FormField label="Business name" htmlFor="biz-name">
            <TextInput
              id="biz-name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Business email" htmlFor="biz-email">
              <TextInput
                id="biz-email"
                type="email"
                value={businessEmail}
                onChange={(e) => setBusinessEmail(e.target.value)}
              />
            </FormField>
            <FormField label="Business phone" htmlFor="biz-phone">
              <TextInput
                id="biz-phone"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
              />
            </FormField>
          </div>
          <SettlementBankFields
            bankCode={bankCode}
            accountNumber={accountNumber}
            onBankCodeChange={setBankCode}
            onAccountNumberChange={setAccountNumber}
            onVerificationChange={setVerification}
            initialAccountName={subaccount?.settlementAccountName}
            bankFieldId="bank-code"
            accountFieldId="acct-num"
          />
          <FormField label="Default provider" htmlFor="default-provider">
            <SelectInput
              id="default-provider"
              options={[
                { value: "paystack", label: "Paystack" },
                { value: "flutterwave", label: "Flutterwave" },
              ]}
              value={defaultProvider}
              onChange={(e) =>
                setDefaultProvider(e.target.value as "" | "paystack" | "flutterwave")
              }
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={courseSalesEnabled}
              onChange={(e) => setCourseSalesEnabled(e.target.checked)}
            />
            Enable paid course sales
          </label>
          {subaccountError ? <p className="text-sm text-red-600">{subaccountError}</p> : null}
          {subaccountInfo ? <p className="text-sm text-green-700">{subaccountInfo}</p> : null}
          <div>
            <Button type="submit" disabled={subaccountPending || !verification.verified}>
              {subaccountPending ? "Saving…" : "Save settlement details"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
