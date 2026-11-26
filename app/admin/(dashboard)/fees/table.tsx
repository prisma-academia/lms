"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export type FeeRow = {
  id: string;
  name: string;
  target: string;
  amount: string;
  /** ISO timestamp for sorting; the label is what is shown. */
  dueAt: string | null;
  dueLabel: string;
  paymentsRecorded: number;
};

const columns: ColumnDef<FeeRow>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "target", header: "Charged to" },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: (info) => <span className="num whitespace-nowrap">{info.getValue() as string}</span>,
  },
  {
    accessorKey: "dueAt",
    header: "Due",
    cell: (info) => (
      <span className="num whitespace-nowrap text-xs text-muted-foreground">
        {info.row.original.dueLabel}
      </span>
    ),
  },
  {
    accessorKey: "paymentsRecorded",
    header: "Payments recorded",
    cell: (info) => <span className="num">{info.getValue() as number}</span>,
  },
];

export function FeesTable({ data, canCreate = true }: { data: FeeRow[]; canCreate?: boolean }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(f) => `/admin/fees/${f.id}`}
      searchPlaceholder="Search fees…"
      empty={
        <EmptyState
          icon="credit-card"
          title="No fees yet"
          action={
            canCreate ? (
              <Button asChild size="sm">
                <Link href="/admin/fees/new">New fee</Link>
              </Button>
            ) : undefined
          }
        >
          A fee is an amount you charge one learner or a whole group — tuition, materials, an exam.
          You record here who has paid.
        </EmptyState>
      }
    />
  );
}
