"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Card } from "@/components/shell";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { formatActivityAction } from "@/lib/activity/display";
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
  /** ISO timestamp for sorting; the label is what is shown. */
  lastLoginAt: string | null;
  lastLoginLabel: string;
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
    /** `trialEndsAt` formatted on the server; null when there is no trial. */
    trialEndsLabel: string | null;
    trialDaysLeft: number | null;
    subscriptionStatus: string;
    subscriptionEndsAt: string | null;
    /** `subscriptionEndsAt` formatted on the server. */
    subscriptionEndsLabel: string | null;
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
  counts: {
    users: number;
    learners: number;
    courses: number;
    enrollments: number;
  };
  users: TenantUserRow[];
  plans: SubscriptionPlanOption[];
  activity: Array<{ id: string; action: string; createdAt: string; createdLabel: string }>;
};

const TABS = ["Overview", "Profile", "Billing", "Staff"] as const;
type Tab = (typeof TABS)[number];

const STATUS: Record<string, { label: string; color?: string }> = {
  ACTIVE: { label: "Active", color: "var(--success)" },
  SUSPENDED: { label: "Suspended", color: "var(--warning)" },
  ARCHIVED: { label: "Archived" },
};

const userColumns: ColumnDef<TenantUserRow>[] = [
  { accessorKey: "email", header: "Email" },
  {
    id: "name",
    header: "Name",
    accessorFn: (r) => `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "—",
  },
  {
    accessorKey: "isOwner",
    header: "Role",
    cell: (info) => (info.getValue() ? <Badge>Owner</Badge> : "Staff"),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: (info) => ((info.getValue() as string) === "ACTIVE" ? "Active" : "Suspended"),
  },
  {
    accessorKey: "lastLoginAt",
    header: "Last signed in",
    cell: (info) => (
      <span className="num text-xs text-muted-foreground">{info.row.original.lastLoginLabel}</span>
    ),
  },
];

export function TenantDetailTabs({
  tenant,
  counts,
  users,
  plans,
  activity,
  initialTab,
}: TenantDetailProps & {
  /** The `?tab=` the page was opened with, if any. */
  initialTab?: string;
}) {
  // The open tab lives in the address (`?tab=billing`), so a refresh, a shared
  // link or the Back button lands on the same tab instead of always on
  // Overview. `replaceState` rather than the router: this is client state, and
  // the address follows the tab without a round trip to the server.
  const [tab, setTabState] = useState<Tab>(
    () => TABS.find((t) => t.toLowerCase() === (initialTab ?? "").toLowerCase()) ?? "Overview"
  );
  function setTab(next: Tab) {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === "Overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next.toLowerCase());
    window.history.replaceState(null, "", url);
  }
  const status = STATUS[tenant.status];

  return (
    <div>
      <div className="mb-6 max-w-full overflow-x-auto pb-1">
        <Segmented
          ariaLabel="Academy sections"
          options={TABS.map((t) => ({ value: t, label: t }))}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "Overview" ? (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <dl className="grid min-w-0 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-xs font-bold text-muted-foreground">Web address</dt>
                  <dd className="mt-0.5 truncate font-mono text-sm" translate="no">
                    {tenant.slug}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-muted-foreground">Status</dt>
                  <dd className="mt-0.5">
                    {status ? <Badge color={status.color}>{status.label}</Badge> : tenant.status}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-muted-foreground">Plan</dt>
                  <dd className="mt-0.5 font-bold">
                    {tenant.subscriptionPlan?.name ?? tenant.plan}
                    {tenant.trialEndsLabel ? (
                      <span className="block text-xs font-medium text-muted-foreground">
                        Trial ends {tenant.trialEndsLabel}
                        {tenant.trialDaysLeft != null
                          ? ` (${tenant.trialDaysLeft} ${tenant.trialDaysLeft === 1 ? "day" : "days"} left)`
                          : ""}
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>
              <TenantActions tenantId={tenant.id} status={tenant.status} />
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon="users" label="Staff" value={String(counts.users)} />
            <StatCard icon="user" label="Learners" value={String(counts.learners)} />
            <StatCard icon="book" label="Courses" value={String(counts.courses)} />
            <StatCard icon="chart" label="Enrolments" value={String(counts.enrollments)} />
          </div>
          <h2 className="mt-8 mb-3 font-heading text-lg leading-tight">Recent activity</h2>
          <Card className="p-0">
            {activity.length === 0 ? (
              <EmptyState icon="clock" title="Nothing recorded yet">
                Sign-ins and changes at this academy are listed here as they happen.
              </EmptyState>
            ) : (
              <ul className="text-sm">
                {activity.map((l, i) => (
                  <li
                    key={l.id}
                    className={
                      "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-5 py-3" +
                      (i > 0 ? " border-t-2 border-dashed border-border" : "")
                    }
                  >
                    <span className="min-w-0 font-bold">{formatActivityAction(l.action)}</span>
                    <span className="num shrink-0 text-xs text-muted-foreground">
                      {l.createdLabel} UTC
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}

      {tab === "Profile" ? (
        <Card>
          <TenantProfileForm tenant={tenant} />
        </Card>
      ) : null}

      {tab === "Billing" ? <TenantBillingPanel tenant={tenant} plans={plans} /> : null}

      {tab === "Staff" ? (
        <Card>
          <h2 className="mb-4 font-heading text-base leading-tight">
            Staff at this academy <span className="num text-muted-foreground">({users.length})</span>
          </h2>
          {/* No row link: a staff member's page lives in the academy's own
              admin, not in the platform console — linking these rows to
              /users/{id} opened the wrong kind of user and a "not found". */}
          <DataTable
            columns={userColumns}
            data={users}
            searchPlaceholder="Search staff…"
            empty={
              <EmptyState icon="users" title="No staff yet">
                Nobody has been added to this academy.
              </EmptyState>
            }
          />
        </Card>
      ) : null}
    </div>
  );
}
