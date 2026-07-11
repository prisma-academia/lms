"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { formatActivityAction } from "@/lib/activity/display";

export type ActivityRow = {
  id: string;
  tenantId: string | null;
  actorType: string;
  actorId: string | null;
  actorLabel?: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  createdAt: string;
};

function buildColumns(variant: "tenant" | "platform"): ColumnDef<ActivityRow>[] {
  const cols: ColumnDef<ActivityRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Time",
      cell: (info) => (
        <span className="text-xs text-stone-500">
          {new Date(info.getValue() as string).toLocaleString()}
        </span>
      ),
    },
  ];

  if (variant === "platform") {
    cols.push({
      accessorKey: "tenantId",
      header: "Tenant",
      cell: (info) => (info.getValue() as string) ?? "—",
    });
  }

  cols.push(
    {
      id: "actor",
      header: "Actor",
      accessorFn: (r) => r.actorLabel ?? `${r.actorType}:${r.actorId ?? "—"}`,
      cell: (info) => <span className="text-xs">{info.getValue() as string}</span>,
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: (info) => (
        <span className="text-xs font-medium">{formatActivityAction(info.getValue() as string)}</span>
      ),
    },
    {
      id: "target",
      header: "Target",
      accessorFn: (r) => (r.targetType ? r.targetType : "—"),
      cell: (info) => <span className="text-xs text-stone-500">{info.getValue() as string}</span>,
    },
    {
      accessorKey: "ip",
      header: "IP",
      cell: (info) => (info.getValue() as string) ?? "—",
    }
  );

  return cols;
}

export function ActivityTable({
  data,
  variant = "platform",
}: {
  data: ActivityRow[];
  variant?: "tenant" | "platform";
}) {
  return (
    <DataTable
      columns={buildColumns(variant)}
      data={data}
      filterColumnId="action"
      searchPlaceholder="Search by action…"
    />
  );
}
