"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export type CoursePaymentRow = {
  id: string;
  course: string;
  client: string;
  amount: string;
  payout: string;
  /** How the payment was taken, in words ("Monnify", "Recorded by staff"). */
  provider: string;
  /** The stored status code; the column shows it in words. */
  status: string;
  /** ISO timestamp for sorting; the label is what is shown. */
  createdAt: string;
  createdLabel: string;
};

/** A status is a word first; the colour only reinforces it. */
const STATUS: Record<string, { label: string; color?: string }> = {
  SUCCESS: { label: "Paid", color: "var(--success)" },
  PENDING: { label: "Waiting for payment", color: "var(--warning)" },
  FAILED: { label: "Failed", color: "var(--destructive)" },
  REFUNDED: { label: "Refunded" },
};

const columns: ColumnDef<CoursePaymentRow>[] = [
  { accessorKey: "course", header: "Course" },
  { accessorKey: "client", header: "Learner" },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: (info) => <span className="num whitespace-nowrap">{info.getValue() as string}</span>,
  },
  {
    accessorKey: "payout",
    header: "Your share",
    cell: (info) => <span className="num whitespace-nowrap">{info.getValue() as string}</span>,
  },
  { accessorKey: "provider", header: "Paid through" },
  {
    id: "status",
    header: "Status",
    // The words shown are what the search box matches.
    accessorFn: (row) => STATUS[row.status]?.label ?? row.status,
    cell: (info) => {
      const status = STATUS[info.row.original.status];
      return status ? <Badge color={status.color}>{status.label}</Badge> : info.row.original.status;
    },
  },
  {
    accessorKey: "createdAt",
    header: "Date",
    cell: (info) => (
      <span className="num whitespace-nowrap text-xs text-muted-foreground">
        {info.row.original.createdLabel}
      </span>
    ),
  },
];

export function CoursePaymentsTable({ data }: { data: CoursePaymentRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search payments…"
      empty={
        <EmptyState icon="credit-card" title="No payments yet">
          When a learner buys one of your paid courses, the payment appears here with the share
          that is paid out to you.
        </EmptyState>
      }
    />
  );
}
