"use client";

import { useState } from "react";
import { apiPatch } from "@/lib/client/api";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput } from "@/components/form-field";
import type { SubscriptionPlanOption } from "./tenant-tabs";

type BillingTenant = {
  id: string;
  plan: string;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  subscriptionStatus: string;
  subscriptionEndsAt: string | null;
  storageUsedLabel: string;
  storageQuotaLabel: string;
  storagePercent: number;
  subscriptionPlan: { id: string; name: string; code: string } | null;
  subaccount: {
    paystackStatus: string;
    flutterwaveStatus: string;
    courseSalesEnabled: boolean;
    businessName: string;
  } | null;
};

function formatPrice(cents: number): string {
  if (cents === 0) return "Custom";
  return `₦${(cents / 100).toLocaleString()}/mo`;
}

function storageGb(bytesStr: string): string {
  const gb = Number(bytesStr) / 1024 ** 3;
  return gb >= 1024 ? `${(gb / 1024).toFixed(0)} TB` : `${gb.toFixed(0)} GB`;
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
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function extendTrial() {
    setError(null);
    setInfo(null);
    setPending("extend");
    const days = parseInt(extendDays, 10);
    const res = await apiPatch(`/api/platform/tenants/${tenant.id}/plan`, {
      action: "extend_trial",
      days: Number.isFinite(days) && days > 0 ? days : undefined,
    });
    setPending(null);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setInfo("Trial extended.");
    window.location.reload();
  }

  async function activateManual() {
    if (!planId) {
      setError("Select a plan.");
      return;
    }
    setError(null);
    setInfo(null);
    setPending("activate");
    const res = await apiPatch(`/api/platform/tenants/${tenant.id}/plan`, {
      action: "activate_manual",
      planId,
    });
    setPending(null);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setInfo("Plan activated manually.");
    window.location.reload();
  }

  const publicPlans = plans.filter((p) => p.code !== "trial");

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase text-stone-500">Plan</div>
            <div className="mt-1 text-lg font-semibold">{tenant.plan}</div>
            {tenant.subscriptionPlan ? (
              <div className="text-sm text-stone-600">{tenant.subscriptionPlan.name}</div>
            ) : null}
          </div>
          <div>
            <div className="text-xs uppercase text-stone-500">Subscription</div>
            <div className="mt-1 text-sm">{tenant.subscriptionStatus}</div>
            {tenant.subscriptionEndsAt ? (
              <div className="text-xs text-stone-500">
                Renews / ends {new Date(tenant.subscriptionEndsAt).toLocaleDateString()}
              </div>
            ) : null}
          </div>
          <div>
            <div className="text-xs uppercase text-stone-500">Trial</div>
            <div className="mt-1 text-sm">
              {tenant.trialEndsAt
                ? `${new Date(tenant.trialEndsAt).toLocaleDateString()}${
                    tenant.trialDaysLeft != null ? ` (${tenant.trialDaysLeft}d left)` : ""
                  }`
                : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-stone-500">Storage</div>
            <div className="mt-1 text-sm">
              {tenant.storageUsedLabel} / {tenant.storageQuotaLabel} ({tenant.storagePercent}%)
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-stone-800"
                style={{ width: `${tenant.storagePercent}%` }}
              />
            </div>
          </div>
        </div>
      </Card>

      {tenant.subaccount ? (
        <Card>
          <div className="text-xs uppercase text-stone-500">Payout subaccounts</div>
          <div className="mt-2 space-y-1 text-sm">
            <div>Business: {tenant.subaccount.businessName}</div>
            <div>Paystack: {tenant.subaccount.paystackStatus}</div>
            <div>Flutterwave: {tenant.subaccount.flutterwaveStatus}</div>
            <div>Course sales: {tenant.subaccount.courseSalesEnabled ? "enabled" : "disabled"}</div>
          </div>
        </Card>
      ) : null}

      <Card>
        <h3 className="text-sm font-semibold">Platform actions</h3>
        <div className="mt-4 space-y-6">
          <div>
            <FormField label="Extend trial (days)" htmlFor="extend-days">
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
            <Button
              className="mt-2"
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={extendTrial}
            >
              {pending === "extend" ? "…" : "Extend trial"}
            </Button>
          </div>
          <div>
            <FormField label="Activate plan manually (enterprise / offline)" htmlFor="manual-plan">
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
            <Button
              className="mt-2"
              size="sm"
              disabled={pending !== null}
              onClick={activateManual}
            >
              {pending === "activate" ? "…" : "Activate plan"}
            </Button>
          </div>
        </div>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {info ? <p className="mt-4 text-sm text-green-700">{info}</p> : null}
      </Card>
    </div>
  );
}
