"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

export type ProgrammeRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  courseCount: number;
  /** ISO string, kept for sorting. */
  createdAt: string;
  /** Formatted on the server in the academy's locale. */
  createdLabel: string;
};

/** "PUBLISHED" → "Published". The word carries the meaning; the tint is a second cue. */
function StatusCell({ status }: { status: string }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return <Badge color={status === "PUBLISHED" ? "var(--success)" : undefined}>{label}</Badge>;
}

const columns: ColumnDef<ProgrammeRow>[] = [
  {
    id: "title",
    header: "Programme",
    // Title and address in one value, so searching finds a programme by either.
    accessorFn: (r) => `${r.title} /${r.slug}`,
    cell: (info) => (
      <span className="block min-w-40 max-w-sm">
        <span className="block truncate font-bold text-foreground">{info.row.original.title}</span>
        <span className="block truncate text-xs font-medium text-muted-foreground" translate="no">
          /{info.row.original.slug}
        </span>
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: (info) => <StatusCell status={info.getValue() as string} />,
  },
  {
    accessorKey: "courseCount",
    header: "Courses",
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

export function ProgrammesTable({ data, empty }: { data: ProgrammeRow[]; empty?: ReactNode }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(p) => `/admin/programmes/${p.id}`}
      searchPlaceholder="Search programmes…"
      empty={empty}
    />
  );
}
