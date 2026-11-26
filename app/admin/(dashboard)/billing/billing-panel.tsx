"use client";

import { useId, useState } from "react";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ProgressBar } from "@/components/ui/progress-bar";
import { FormField, TextInput } from "@/components/form-field";
import {
  SettlementBankFields,
  type VerificationState,
} from "@/components/billing/settlement-bank-fields";
import { CheckoutVerifier } from "@/components/billing/checkout-verifier";

type BillingSnapshot = {
  plan: string;
  /** Formatted on the server, in the academy's locale and time zone. */
  trialEndsLabel: string | null;
  trialDaysLeft: number | null;
  subscriptionStatus: string;
  subscriptionEndsLabel: string | null;
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

/** Where the payout account stands on the gateway that takes payments today. */
type PayoutStatus = "ACTIVE" | "PENDING" | "FAILED" | "SUSPENDED" | "NOT_SET_UP";

type SubaccountSnapshot = {
  businessName: string;
  businessEmail: string | null;
  businessPhone: string | null;
  settlementBankCode: string;
  settlementAccountNumber: string;
  settlementAccountName: string | null;
  courseSalesEnabled: boolean;
  commissionPct: number;
  payoutStatus: PayoutStatus;
};

type PaymentRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  /** How it was paid, already in words ("Monnify", "Recorded by staff"). */
  via: string;
  dateLabel: string;
};

const SECTION_HEADING = "text-sm font-semibold uppercase text-muted-foreground";

/** An explicit locale: this renders on the server and again in the browser, and the two must agree. */
function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString("en", { maximumFractionDigits: 2 })}`;
}

const PAYOUT_COPY: Record<PayoutStatus, { label: string; color: string; detail: string }> = {
  ACTIVE: {
    label: "Active",
    color: "var(--success)",
    detail: "Your share of every sale is paid into the account below.",
  },
  PENDING: {
    label: "Not active yet",
    color: "var(--warning)",
    detail: "Save your settlement details to activate payouts.",
  },
  NOT_SET_UP: {
    label: "Not set up",
    color: "var(--warning)",
    detail: "Add the bank account your sales should be paid into.",
  },
  FAILED: {
    label: "Could not be activated",
    color: "var(--destructive)",
    detail: "The payout account could not be registered. Check the details and save again.",
  },
  SUSPENDED: {
    label: "Suspended",
    color: "var(--destructive)",
    detail: "Payouts for this academy have been suspended. Please contact support.",
  },
};

export function BillingPanel({
  billing,
  plans,
  subaccount,
  payments,
  paymentsAvailable,
}: {
  billing: BillingSnapshot | null;
  plans: PlanRow[];
  subaccount: SubaccountSnapshot | null;
  payments: PaymentRow[];
  /** False while the platform has no payment gateway configured. */
  paymentsAvailable: boolean;
}) {
  const uid = useId();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutPending, setCheckoutPending] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState(subaccount?.businessName ?? "");
  const [businessEmail, setBusinessEmail] = useState(subaccount?.businessEmail ?? "");
  const [businessPhone, setBusinessPhone] = useState(subaccount?.businessPhone ?? "");
  const [bankCode, setBankCode] = useState(subaccount?.settlementBankCode ?? "");
  const [accountNumber, setAccountNumber] = useState(
    subaccount?.settlementAccountNumber ?? ""
  );
  const [courseSalesEnabled, setCourseSalesEnabled] = useState(
    subaccount?.courseSalesEnabled ?? false
  );
  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus>(
    subaccount?.payoutStatus ?? "NOT_SET_UP"
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
    const res = await apiPost<{ checkoutUrl: string }>("/api/tenant/billing/checkout", { planId });
    if (res.error || !res.data?.checkoutUrl) {
      setCheckoutPending(null);
      setCheckoutError(res.error?.message ?? "Could not start the payment. Please try again.");
      return;
    }
    // Left pending on purpose: the page is about to navigate to the payment
    // page, and a button that springs back to "Upgrade" invites a second press.
    window.location.assign(res.data.checkoutUrl);
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
    const res = await apiPost<{
      payouts: { active: boolean; status: PayoutStatus; problem: string | null };
    }>("/api/tenant/billing/subaccount", {
      businessName: businessName.trim(),
      businessEmail: businessEmail.trim() || undefined,
      businessPhone: businessPhone.trim() || undefined,
      settlementBankCode: bankCode.trim(),
      settlementAccountNumber: accountNumber.trim(),
      courseSalesEnabled,
    });
    setSubaccountPending(false);
    if (res.error) {
      setSubaccountError(res.error.message);
      return;
    }
    const payouts = res.data?.payouts;
    if (payouts) setPayoutStatus(payouts.status);
    if (payouts?.active) {
      setSubaccountInfo("Saved. Payouts are active.");
    } else {
      // The details are stored either way; say why money cannot flow yet.
      setSubaccountError(
        payouts?.problem ?? "Your details are saved, but payouts are not active yet."
      );
    }
  }

  if (!billing) {
    return <p className="text-sm text-muted-foreground">Billing information unavailable.</p>;
  }

  const payout = PAYOUT_COPY[payoutStatus];

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <CheckoutVerifier successMessage="Subscription activated." />

      <section>
        <h2 className={SECTION_HEADING}>Current plan</h2>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="font-medium">{billing.currentPlan?.name ?? billing.plan}</dd>
          <dt className="text-muted-foreground">Subscription status</dt>
          <dd className="font-medium">{billing.subscriptionStatus}</dd>
          {billing.subscriptionEndsLabel ? (
            <>
              <dt className="text-muted-foreground">Renews / ends</dt>
              <dd className="font-medium">{billing.subscriptionEndsLabel}</dd>
            </>
          ) : null}
          {billing.trialDaysLeft != null ? (
            <>
              <dt className="text-muted-foreground">Trial days left</dt>
              <dd className="num font-medium">{billing.trialDaysLeft}</dd>
            </>
          ) : null}
          {billing.trialEndsLabel ? (
            <>
              <dt className="text-muted-foreground">Trial ends</dt>
              <dd className="font-medium">{billing.trialEndsLabel}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section>
        <h2 className={SECTION_HEADING}>Storage</h2>
        <div className="mt-4">
          <div className="num mb-1.5 flex justify-between text-sm font-medium">
            <span>
              {billing.storageUsedLabel} / {billing.storageQuotaLabel}
            </span>
            <span>{billing.storagePercent}%</span>
          </div>
          <ProgressBar value={billing.storagePercent} size="sm" label="Storage used" />
        </div>
      </section>

      {plans.length > 0 ? (
        <section>
          <h2 className={SECTION_HEADING}>Upgrade</h2>
          {paymentsAvailable ? null : (
            <p
              role="note"
              className="mt-3 rounded-[10px] border-2 border-warning bg-warning/15 px-3 py-2 text-[13px] font-medium text-foreground"
            >
              Online payments are not set up on this platform yet, so plans cannot be bought here.
              Please contact the platform administrator to change your plan.
            </p>
          )}
          <ul className="mt-4 flex flex-col gap-3">
            {plans.map((plan) => (
              <li
                key={plan.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border-2 border-border bg-background p-4 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-bold">{plan.name}</div>
                  <div className="num mt-1 text-xs font-medium text-muted-foreground">
                    {money(plan.priceMonthlyCents, plan.currency)}/mo · {plan.storageQuotaLabel}{" "}
                    storage
                    {plan.maxCourses != null ? ` · up to ${plan.maxCourses} courses` : ""}
                  </div>
                </div>
                <Button
                  onClick={() => startCheckout(plan.id)}
                  disabled={!paymentsAvailable || checkoutPending !== null}
                >
                  {checkoutPending === plan.id ? "Opening payment…" : "Upgrade"}
                </Button>
              </li>
            ))}
          </ul>
          {checkoutError ? (
            <p role="alert" className="mt-2 text-sm font-bold text-destructive">
              {checkoutError}
            </p>
          ) : null}
        </section>
      ) : null}

      {payments.length > 0 ? (
        <section>
          <h2 className={SECTION_HEADING}>Recent payments</h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
                <span className="num font-medium">
                  {money(p.amountCents, p.currency)} · {p.via} · {p.status}
                </span>
                <span className="num text-xs text-muted-foreground">{p.dateLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className={SECTION_HEADING}>Payouts</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge color={payout.color}>{payout.label}</Badge>
          <p className="text-[13px] font-medium text-muted-foreground">{payout.detail}</p>
        </div>
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          When a learner pays for a course, programme or library item, the money is split at the
          moment of payment
          {subaccount ? `: the platform keeps ${subaccount.commissionPct}%, and the rest` : ", and your share"}{" "}
          goes straight to your bank account.
          {subaccount?.settlementAccountName
            ? ` Account name on file: ${subaccount.settlementAccountName}.`
            : ""}
        </p>

        <form onSubmit={saveSubaccount} className="mt-4 flex flex-col gap-4">
          <FormField label="Business name" htmlFor="biz-name">
            <TextInput
              id="biz-name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Business email" htmlFor="biz-email">
              <TextInput
                id="biz-email"
                type="email"
                autoComplete="email"
                value={businessEmail}
                onChange={(e) => setBusinessEmail(e.target.value)}
              />
            </FormField>
            <FormField label="Business phone" htmlFor="biz-phone">
              <TextInput
                id="biz-phone"
                type="tel"
                autoComplete="tel"
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
          <div className="flex items-start gap-2.5">
            <Checkbox
              id={`${uid}-sales`}
              checked={courseSalesEnabled}
              onCheckedChange={(v) => setCourseSalesEnabled(v === true)}
              className="mt-0.5"
            />
            <label htmlFor={`${uid}-sales`} className="text-sm font-medium">
              Sell paid courses, programmes and library items
              <span className="block text-xs font-medium text-muted-foreground">
                Learners can only pay once payouts are active. Free content is not affected.
              </span>
            </label>
          </div>
          {subaccountError ? (
            <p role="alert" className="text-sm font-bold text-destructive">
              {subaccountError}
            </p>
          ) : null}
          {subaccountInfo ? (
            <p role="status" className="text-sm font-bold text-foreground">
              {subaccountInfo}
            </p>
          ) : null}
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
