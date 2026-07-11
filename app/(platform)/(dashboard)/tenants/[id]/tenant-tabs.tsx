"use client";

import { useState } from "react";
import { Card } from "@/components/shell";
import { TenantActions } from "./actions";
import { TenantProfileForm } from "./profile-form";
import { TenantBillingPanel } from "./billing-panel";

export type TenantUserRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isOwner: boolean;
  status: string;
  lastLoginAt: string | null;
};

export type SubscriptionPlanOption = {
  id: string;
  code: string;
  name: string;
  priceMonthlyCents: number;
  storageQuotaBytes: string;
};

export type TenantDetailProps = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    plan: string;
    trialEndsAt: string | null;
    trialDaysLeft: number | null;
    subscriptionStatus: string;
    subscriptionEndsAt: string | null;
    storageUsedLabel: string;
    storageQuotaLabel: string;
    storagePercent: number;
    companyEmail: string | null;
    companyPhone: string | null;
    website: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    createdAt: string;
    subscriptionPlan: { id: string; name: string; code: string } | null;
    subaccount: {
      paystackStatus: string;
      flutterwaveStatus: string;
      courseSalesEnabled: boolean;
      businessName: string;
    } | null;
  };
  counts: {
    users: number;
    learners: number;
    courses: number;
    enrollments: number;
  };
  users: TenantUserRow[];
  plans: SubscriptionPlanOption[];
  activity: Array<{ id: string; action: string; createdAt: string }>;
};

const TABS = ["Overview", "Profile", "Billing", "Users"] as const;
type Tab = (typeof TABS)[number];

export function TenantDetailTabs({
  tenant,
  counts,
  users,
  plans,
  activity,
}: TenantDetailProps) {
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2 border-b border-stone-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <>
          <Card className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase text-stone-500">Slug / Status / Plan</div>
                <div className="mt-1 font-mono text-sm">{tenant.slug}</div>
                <div className="mt-1 text-sm">
                  {tenant.status} · {tenant.plan}
                  {tenant.trialEndsAt ? (
                    <span className="text-stone-500">
                      {" "}
                      · trial ends {new Date(tenant.trialEndsAt).toLocaleDateString()}
                      {tenant.trialDaysLeft != null ? ` (${tenant.trialDaysLeft}d left)` : ""}
                    </span>
                  ) : null}
                </div>
              </div>
              <TenantActions tenantId={tenant.id} status={tenant.status} />
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <div className="text-xs uppercase text-stone-500">Staff users</div>
              <div className="mt-1 text-2xl font-semibold">{counts.users}</div>
            </Card>
            <Card>
              <div className="text-xs uppercase text-stone-500">Learners</div>
              <div className="mt-1 text-2xl font-semibold">{counts.learners}</div>
            </Card>
            <Card>
              <div className="text-xs uppercase text-stone-500">Courses</div>
              <div className="mt-1 text-2xl font-semibold">{counts.courses}</div>
            </Card>
            <Card>
              <div className="text-xs uppercase text-stone-500">Enrollments</div>
              <div className="mt-1 text-2xl font-semibold">{counts.enrollments}</div>
            </Card>
          </div>
          <h2 className="mt-8 mb-2 text-sm font-semibold uppercase text-stone-500">Activity</h2>
          <Card>
            <ul className="divide-y divide-stone-100 text-sm">
              {activity.length === 0 ? (
                <li className="py-3 text-stone-500">No activity yet.</li>
              ) : (
                activity.map((l) => (
                  <li key={l.id} className="flex justify-between py-2">
                    <span className="font-mono text-xs">{l.action}</span>
                    <span className="text-xs text-stone-500">
                      {new Date(l.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </>
      ) : null}

      {tab === "Profile" ? (
        <Card>
          <TenantProfileForm tenant={tenant} />
        </Card>
      ) : null}

      {tab === "Billing" ? (
        <TenantBillingPanel tenant={tenant} plans={plans} />
      ) : null}

      {tab === "Users" ? (
        <Card>
          <div className="mb-4 text-xs uppercase text-stone-500">Tenant staff ({users.length})</div>
          {users.length === 0 ? (
            <p className="text-sm text-stone-500">No users yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-xs uppercase text-stone-500">
                    <th className="pb-2 pr-4">Email</th>
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Owner</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Last login</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2 pr-4 font-mono text-xs">{u.email}</td>
                      <td className="py-2 pr-4">
                        {`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "—"}
                      </td>
                      <td className="py-2 pr-4">{u.isOwner ? "yes" : "no"}</td>
                      <td className="py-2 pr-4">{u.status}</td>
                      <td className="py-2 text-xs text-stone-500">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
