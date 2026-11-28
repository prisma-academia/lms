"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/ui/empty-state";
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
  /** ISO timestamp — what the column sorts by. */
  createdAt: string;
  /** The same instant, formatted on the server for display. */
  createdLabel: string;
};

/** Who did it, in words, when the page could not resolve a name. */
const ACTOR_KIND: Record<string, string> = {
  TENANT_USER: "Staff member",
  CLIENT: "Learner",
  PLATFORM_USER: "Platform user",
  SYSTEM: "System",
  API_KEY: "API key",
};

function buildColumns(variant: "tenant" | "platform"): ColumnDef<ActivityRow>[] {
  const cols: ColumnDef<ActivityRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Time",
      cell: (info) => (
        <span className="num whitespace-nowrap text-xs text-muted-foreground">
          {info.row.original.createdLabel}
        </span>
      ),
    },
  ];

  if (variant === "platform") {
    cols.push({
      accessorKey: "tenantId",
      header: "Academy",
      cell: (info) => (
        <span className="font-mono text-xs" translate="no">
          {(info.getValue() as string) ?? "—"}
        </span>
      ),
    });
  }

  cols.push(
    {
      id: "actor",
      header: "Who",
      accessorFn: (r) => r.actorLabel ?? ACTOR_KIND[r.actorType] ?? r.actorType,
      cell: (info) => <span className="text-xs">{info.getValue() as string}</span>,
    },
    {
      id: "action",
      header: "What happened",
      // The words shown are what the search box matches, not the stored code.
      accessorFn: (r) => formatActivityAction(r.action),
      cell: (info) => <span className="text-xs font-bold">{info.getValue() as string}</span>,
    },
    {
      id: "target",
      header: "On",
      accessorFn: (r) => (r.targetType ? r.targetType : "—"),
      cell: (info) => (
        <span className="text-xs text-muted-foreground">{info.getValue() as string}</span>
      ),
    },
    {
      accessorKey: "ip",
      header: "IP address",
      cell: (info) => (
        <span className="num text-xs text-muted-foreground">
          {(info.getValue() as string) ?? "—"}
        </span>
      ),
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
      searchPlaceholder="Search activity…"
      empty={
        <EmptyState icon="clock" title="Nothing recorded yet">
          Sign-ins, changes and other important actions are listed here as they happen.
        </EmptyState>
      }
    />
  );
}
