"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type UserGroupRow = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  /** ISO string, kept for sorting. */
  createdAt: string;
  /** Formatted on the server in the academy's locale. */
  createdLabel: string;
};

const columns: ColumnDef<UserGroupRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: (info) => <span className="font-bold text-foreground">{info.getValue() as string}</span>,
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: (info) => (
      <span className="line-clamp-2 max-w-md text-muted-foreground">
        {(info.getValue() as string | null) ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "memberCount",
    header: "Members",
    cell: (info) => <span className="num">{info.getValue() as number}</span>,
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: (info) => (
      <span className="num text-xs font-medium text-muted-foreground">
        {info.row.original.createdLabel}
      </span>
    ),
  },
];

export function UserGroupsTable({ data, empty }: { data: UserGroupRow[]; empty?: ReactNode }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(g) => `/admin/user-groups/${g.id}`}
      searchPlaceholder="Search groups…"
      empty={empty}
    />
  );
}
