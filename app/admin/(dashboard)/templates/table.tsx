"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type TemplateRow = {
  id: string;
  name: string;
  type: string;
  createdAt: string;
};

const columns: ColumnDef<TemplateRow>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "type", header: "Type", cell: (i) => <span className="font-mono text-xs">{i.getValue() as string}</span> },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: (i) => <span className="text-xs text-stone-500">{new Date(i.getValue() as string).toLocaleDateString()}</span>,
  },
];

export function TemplatesTable({ data }: { data: TemplateRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(t) => `/admin/templates/${t.id}`}
      filterColumnId="name"
      searchPlaceholder="Search by name…"
    />
  );
}
