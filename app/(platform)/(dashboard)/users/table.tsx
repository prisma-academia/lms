"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export type PlatformUserRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  isSuperAdmin: boolean;
  /** ISO timestamp for sorting; the label is what is shown. */
  lastLoginAt: string | null;
  lastLoginLabel: string;
};

const columns: ColumnDef<PlatformUserRow>[] = [
  { accessorKey: "email", header: "Email" },
  {
    id: "name",
    header: "Name",
    accessorFn: (r) => `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "—",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: (info) =>
      (info.getValue() as string) === "ACTIVE" ? "Active" : <Badge color="var(--warning)">Suspended</Badge>,
  },
  {
    accessorKey: "isSuperAdmin",
    header: "Access",
    cell: (info) => (info.getValue() ? <Badge>Super admin</Badge> : "By permission"),
  },
  {
    accessorKey: "lastLoginAt",
    header: "Last signed in",
    cell: (info) => (
      <span className="num text-xs text-muted-foreground">{info.row.original.lastLoginLabel}</span>
    ),
  },
];

export function UsersTable({ data }: { data: PlatformUserRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(u) => `/users/${u.id}`}
      searchPlaceholder="Search users…"
      empty={
        <EmptyState
          icon="users"
          title="No platform users yet"
          action={
            <Button asChild size="sm">
              <Link href="/users/new">Invite user</Link>
            </Button>
          }
        >
          Platform users run the whole installation: they create academies and manage plans.
        </EmptyState>
      }
    />
  );
}
