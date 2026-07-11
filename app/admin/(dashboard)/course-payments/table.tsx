"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type CoursePaymentRow = {
  id: string;
  course: string;
  client: string;
  amount: string;
  payout: string;
  provider: string;
  status: string;
  createdAt: string;
};

const columns: ColumnDef<CoursePaymentRow>[] = [
  { accessorKey: "course", header: "Course" },
  { accessorKey: "client", header: "Learner" },
  { accessorKey: "amount", header: "Amount" },
  { accessorKey: "payout", header: "Payout" },
  { accessorKey: "provider", header: "Provider" },
  { accessorKey: "status", header: "Status" },
  {
    accessorKey: "createdAt",
    header: "Date",
    cell: (info) => (
      <span className="text-xs text-stone-500">
        {new Date(info.getValue() as string).toLocaleDateString()}
      </span>
    ),
  },
];

export function CoursePaymentsTable({ data }: { data: CoursePaymentRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumnId="client"
      searchPlaceholder="Search by learner email…"
    />
  );
}
