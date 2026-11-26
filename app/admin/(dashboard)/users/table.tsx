"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

export type TenantUserRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isOwner: boolean;
  status: string;
  /** ISO string, kept for sorting. */
  lastLoginAt: string | null;
  /** The same moment as people read it, formatted on the server. */
  lastLoginLabel: string;
};

/** "ACTIVE" → "Active". The word carries the meaning; the tint is a second cue. */
function StatusCell({ status }: { status: string }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return <Badge color={status === "ACTIVE" ? "var(--success)" : undefined}>{label}</Badge>;
}

const columns: ColumnDef<TenantUserRow>[] = [
  {
    id: "name",
    header: "Name",
    accessorFn: (r) => `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "—",
    cell: (info) => <span className="font-bold text-foreground">{info.getValue() as string}</span>,
  },
  { accessorKey: "email", header: "Email" },
  {
    accessorKey: "isOwner",
    header: "Role",
    cell: (info) =>
      info.getValue() ? (
        <Badge color="var(--primary)">Owner</Badge>
      ) : (
        <span className="text-muted-foreground">Staff</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: (info) => <StatusCell status={info.getValue() as string} />,
  },
  {
    accessorKey: "lastLoginAt",
    header: "Last signed in",
    cell: (info) => (
      <span className="num text-xs font-medium text-muted-foreground">
        {info.row.original.lastLoginLabel}
      </span>
    ),
  },
];

export function TenantUsersTable({ data, empty }: { data: TenantUserRow[]; empty?: ReactNode }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(u) => `/admin/users/${u.id}`}
      searchPlaceholder="Search users…"
      empty={empty}
    />
  );
}
