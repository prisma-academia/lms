"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type FeeRow = {
  id: string;
  name: string;
  target: string;
  amount: string;
  dueAt: string | null;
  paymentsRecorded: number;
};

const columns: ColumnDef<FeeRow>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "target", header: "Target" },
  { accessorKey: "amount", header: "Amount" },
  {
    accessorKey: "dueAt",
    header: "Due",
    cell: (info) => {
      const v = info.getValue() as string | null;
      return <span className="text-xs text-stone-500">{v ? new Date(v).toLocaleDateString() : "—"}</span>;
    },
  },
  { accessorKey: "paymentsRecorded", header: "Payments" },
];

export function FeesTable({ data }: { data: FeeRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(f) => `/admin/fees/${f.id}`}
      filterColumnId="name"
      searchPlaceholder="Search by name…"
    />
  );
}
