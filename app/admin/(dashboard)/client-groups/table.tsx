"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type ClientGroupRow = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
};

const columns: ColumnDef<ClientGroupRow>[] = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "description",
    header: "Description",
    cell: (info) => (info.getValue() as string | null) ?? "—",
  },
  { accessorKey: "memberCount", header: "Members" },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: (info) => (
      <span className="text-xs text-stone-500">
        {new Date(info.getValue() as string).toLocaleDateString()}
      </span>
    ),
  },
];

export function ClientGroupsTable({ data }: { data: ClientGroupRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(g) => `/admin/client-groups/${g.id}`}
      filterColumnId="name"
      searchPlaceholder="Search by name…"
    />
  );
}
