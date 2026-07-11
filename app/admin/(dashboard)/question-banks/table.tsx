"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type BankRow = {
  id: string;
  name: string;
  description: string | null;
  questions: number;
  restricted: string;
};

const columns: ColumnDef<BankRow>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "questions", header: "Questions" },
  { accessorKey: "restricted", header: "Access" },
  {
    accessorKey: "description",
    header: "Description",
    cell: (info) => (info.getValue() as string | null) ?? "—",
  },
];

export function QuestionBanksTable({ data }: { data: BankRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(b) => `/admin/question-banks/${b.id}`}
      filterColumnId="name"
      searchPlaceholder="Search by name…"
    />
  );
}
