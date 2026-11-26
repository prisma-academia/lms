"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export type RoleRow = {
  id: string;
  name: string;
  isSystem: boolean;
  permissionCount: number;
  /** ISO timestamp — what the column sorts by. */
  createdAt: string;
  /** The same instant, formatted on the server for display. */
  createdLabel: string;
};

const columns: ColumnDef<RoleRow>[] = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "permissionCount",
    header: "Permissions",
    cell: (info) => <span className="num">{info.getValue() as number}</span>,
  },
  {
    accessorKey: "isSystem",
    header: "Type",
    cell: (info) => (info.getValue() ? <Badge>Built-in</Badge> : "Custom"),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: (info) => (
      <span className="text-xs text-muted-foreground">{info.row.original.createdLabel}</span>
    ),
  },
];

export function RolesTable({
  data,
  basePath = "/role-templates",
  canCreate = true,
}: {
  data: RoleRow[];
  /** Where a role's page lives: the platform console or an academy's admin. */
  basePath?: string;
  canCreate?: boolean;
}) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(r) => `${basePath}/${r.id}`}
      searchPlaceholder="Search roles…"
      empty={
        <EmptyState
          icon="users"
          title="No roles yet"
          action={
            canCreate ? (
              <Button asChild size="sm">
                <Link href={`${basePath}/new`}>New role</Link>
              </Button>
            ) : undefined
          }
        >
          A role is a reusable set of permissions you can apply to a person in one step.
        </EmptyState>
      }
    />
  );
}
