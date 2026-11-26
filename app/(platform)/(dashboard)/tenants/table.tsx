"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  /** ISO timestamps are what the columns sort by; the labels are what is shown. */
  trialEndsAt: string | null;
  trialEndsLabel: string;
  companyEmail: string | null;
  createdAt: string;
  createdLabel: string;
};

/** A status is a word first; the colour only reinforces it. */
const STATUS: Record<string, { label: string; color?: string }> = {
  ACTIVE: { label: "Active", color: "var(--success)" },
  SUSPENDED: { label: "Suspended", color: "var(--warning)" },
  ARCHIVED: { label: "Archived" },
};

const columns: ColumnDef<TenantRow>[] = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "slug",
    header: "Web address",
    cell: (info) => (
      <span className="font-mono text-xs" translate="no">
        {info.getValue() as string}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: (info) => {
      const status = STATUS[info.getValue() as string];
      return status ? <Badge color={status.color}>{status.label}</Badge> : (info.getValue() as string);
    },
  },
  { accessorKey: "plan", header: "Plan" },
  {
    accessorKey: "trialEndsAt",
    header: "Trial ends",
    cell: (info) => (
      <span className="text-xs text-muted-foreground">{info.row.original.trialEndsLabel}</span>
    ),
  },
  {
    accessorKey: "companyEmail",
    header: "Email",
    cell: (info) => (info.getValue() as string) ?? "—",
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: (info) => (
      <span className="text-xs text-muted-foreground">{info.row.original.createdLabel}</span>
    ),
  },
];

export function TenantsTable({ data }: { data: TenantRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(t) => `/tenants/${t.id}`}
      searchPlaceholder="Search academies…"
      empty={
        <EmptyState
          icon="layers"
          title="No academies yet"
          action={
            <Button asChild size="sm">
              <Link href="/tenants/new">New academy</Link>
            </Button>
          }
        >
          Each academy gets its own web address, staff, learners and courses.
        </EmptyState>
      }
    />
  );
}
