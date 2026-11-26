"use client";

import { useState } from "react";
import { apiPatch } from "@/lib/client/api";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { FormField, SelectInput } from "@/components/form-field";
import type { SubscriptionPlanOption } from "./tenant-tabs";

type BillingTenant = {
  id: string;
  plan: string;
  /** Formatted on the server; null when there is no trial. */
  trialEndsLabel: string | null;
  trialDaysLeft: number | null;
  subscriptionStatus: string;
  /** Formatted on the server; null when there is no end date. */
  subscriptionEndsLabel: string | null;
  storageUsedLabel: string;
  storageQuotaLabel: string;
  storagePercent: number;
  subscriptionPlan: { id: string; name: string; code: string } | null;
  /** False while the platform has no payment gateway configured. */
  paymentsAvailable: boolean;
  /** Name of the gateway payouts are reported for. */
  payoutGateway: string;
  /** "Sandbox" or "Live" when the gateway says which; null when it does not. */
  payoutGatewayMode: "Sandbox" | "Live" | null;
  subaccount: {
    payoutStatus: string;
    payoutCode: string | null;
    commissionPct: number;
    courseSalesEnabled: boolean;
    businessName: string;
  } | null;
};

const PAYOUT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  PENDING: "Not active yet",
  NOT_SET_UP: "Not set up",
  FAILED: "Could not be activated",
  SUSPENDED: "Suspended",
};

/** Subscription states as an operator would say them. Unknown ones are shown as stored. */
const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  NONE: "No paid subscription",
  ACTIVE: "Active",
  PAST_DUE: "Payment overdue",
  CANCELLED: "Cancelled",
};

// An explicit locale: this runs on the server and again in the browser, and
// the two must agree on where the thousands separators go.
const NAIRA = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

function formatPrice(cents: number): string {
  if (cents === 0) return "Custom";
  return `₦${NAIRA.format(cents / 100)} a month`;
}

function storageGb(bytesStr: string): string {
  const gb = Number(bytesStr) / 1024 ** 3;
  return gb >= 1024 ? `${(gb / 1024).toFixed(0)} TB` : `${gb.toFixed(0)} GB`;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  );
}

export function TenantBillingPanel({
  tenant,
  plans,
}: {
  tenant: BillingTenant;
  plans: SubscriptionPlanOption[];
}) {
  const [extendDays, setExtendDays] = useState("90");
  const [planId, setPlanId] = useState(plans.find((p) => p.code !== "trial")?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function extendTrial() {
    setError(null);
    setPending("extend");
    const days = parseInt(extendDays, 10);
    const res = await apiPatch(`/api/platform/tenants/${tenant.id}/plan`, {
      action: "extend_trial",
      days: Number.isFinite(days) && days > 0 ? days : undefined,
    });
    if (res.error) {
      setPending(null);
      setError(res.error.message);
      return;
    }
    // Reloads so every figure on the page reflects the new trial date.
    window.location.reload();
  }

  async function activateManual() {
    if (!planId) {
      setError("Choose a plan first.");
      return;
    }
    setError(null);
    setPending("activate");
    const res = await apiPatch(`/api/platform/tenants/${tenant.id}/plan`, {
      action: "activate_manual",
      planId,
    });
    if (res.error) {
      setPending(null);
      setError(res.error.message);
      return;
    }
    window.location.reload();
  }

  const publicPlans = plans.filter((p) => p.code !== "trial");

  return (
    <div className="space-y-4">
      <Card>
        <dl className="grid gap-5 sm:grid-cols-2">
          <Fact label="Plan">
            <span className="block text-lg font-bold">{tenant.subscriptionPlan?.name ?? tenant.plan}</span>
          </Fact>
          <Fact label="Subscription">
            {SUBSCRIPTION_STATUS_LABEL[tenant.subscriptionStatus] ?? tenant.subscriptionStatus}
            {tenant.subscriptionEndsLabel ? (
              <span className="block text-xs text-muted-foreground">
                Renews or ends on {tenant.subscriptionEndsLabel}
              </span>
            ) : null}
          </Fact>
          <Fact label="Trial">
            {tenant.trialEndsLabel
              ? `Ends ${tenant.trialEndsLabel}${
                  tenant.trialDaysLeft != null
                    ? ` (${tenant.trialDaysLeft} ${tenant.trialDaysLeft === 1 ? "day" : "days"} left)`
                    : ""
                }`
              : "Not on a trial"}
          </Fact>
          <Fact label="Storage">
            <span className="num">
              {tenant.storageUsedLabel} of {tenant.storageQuotaLabel} used ({tenant.storagePercent}%)
            </span>
            <ProgressBar
              value={tenant.storagePercent}
              size="sm"
              className="mt-2"
              label="Storage used"
              color={tenant.storagePercent >= 90 ? "var(--destructive)" : "var(--primary)"}
            />
          </Fact>
        </dl>
      </Card>

      {tenant.paymentsAvailable ? null : (
        <Card>
          <h2 className="font-heading text-base leading-tight">Online payments are not set up</h2>
          <p className="mt-2 max-w-prose text-sm font-medium text-muted-foreground">
            No payment gateway is configured on this platform. Academies cannot buy a plan or sell
            courses online until the {tenant.payoutGateway} API key, secret key and contract code
            are set in the environment.
          </p>
        </Card>
      )}

      {tenant.subaccount ? (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-base leading-tight">Payouts</h2>
            {/* Test money and real money must never be confused: say which
                system the gateway is on, in words, wherever payouts are shown. */}
            {tenant.payoutGatewayMode ? (
              <Badge color={tenant.payoutGatewayMode === "Live" ? "var(--success)" : "var(--warning)"}>
                {tenant.payoutGateway} · {tenant.payoutGatewayMode === "Live" ? "Live" : "Sandbox (test money)"}
              </Badge>
            ) : null}
          </div>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <Fact label="Business name">{tenant.subaccount.businessName}</Fact>
            <Fact label={`${tenant.payoutGateway} payout account`}>
              {PAYOUT_STATUS_LABEL[tenant.subaccount.payoutStatus] ?? tenant.subaccount.payoutStatus}
              {tenant.subaccount.payoutCode ? (
                <span className="block font-mono text-xs text-muted-foreground" translate="no">
                  {tenant.subaccount.payoutCode}
                </span>
              ) : null}
            </Fact>
            <Fact label="Platform commission">
              <span className="num">{tenant.subaccount.commissionPct}%</span>
            </Fact>
            <Fact label="Paid sales">
              {tenant.subaccount.courseSalesEnabled ? "Switched on" : "Switched off"}
            </Fact>
          </dl>
        </Card>
      ) : null}

      <Card>
        <h2 className="font-heading text-base leading-tight">Change this academy&rsquo;s plan</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col items-start gap-2">
            <FormField
              label="Extend the trial by"
              htmlFor="extend-days"
              hint="Puts the academy on the trial plan and adds this much time — counted from the trial's current end date, or from today if it has already ended."
              className="w-full"
            >
              <SelectInput
                id="extend-days"
                allowEmpty={false}
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                options={[
                  { value: "30", label: "30 days" },
                  { value: "60", label: "60 days" },
                  { value: "90", label: "90 days" },
                  { value: "180", label: "180 days" },
                ]}
              />
            </FormField>
            <Button variant="outline" size="sm" disabled={pending !== null} onClick={extendTrial}>
              {pending === "extend" ? "Extending…" : "Extend trial"}
            </Button>
          </div>
          <div className="flex flex-col items-start gap-2">
            <FormField
              label="Put the academy on a plan"
              htmlFor="manual-plan"
              hint="For academies that pay offline or by agreement. No payment is taken."
              className="w-full"
            >
              <SelectInput
                id="manual-plan"
                allowEmpty={false}
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                options={publicPlans.map((p) => ({
                  value: p.id,
                  label: `${p.name} — ${formatPrice(p.priceMonthlyCents)}, ${storageGb(p.storageQuotaBytes)}`,
                }))}
              />
            </FormField>
            <Button size="sm" disabled={pending !== null || publicPlans.length === 0} onClick={activateManual}>
              {pending === "activate" ? "Activating…" : "Activate plan"}
            </Button>
          </div>
        </div>
        {error ? (
          <p role="alert" className="mt-4 text-sm font-bold text-destructive">
            {error}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
