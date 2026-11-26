"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

export type CourseRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  /** In the smallest currency unit, kept for sorting. */
  priceCents: number;
  /** "Free" or the formatted price — formatted on the server. */
  priceLabel: string;
  lessonCount: number;
  enrollmentCount: number;
  /** ISO string, kept for sorting. */
  updatedAt: string;
  /** Formatted on the server in the academy's locale and time zone. */
  updatedLabel: string;
};

/** "PUBLISHED" → "Published". The word carries the meaning; the tint is a second cue. */
function StatusCell({ status }: { status: string }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return <Badge color={status === "PUBLISHED" ? "var(--success)" : undefined}>{label}</Badge>;
}

const columns: ColumnDef<CourseRow>[] = [
  {
    id: "title",
    header: "Course",
    // Title and address in one value, so searching finds a course by either.
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
    accessorKey: "priceCents",
    header: "Price",
    cell: (info) => <span className="num">{info.row.original.priceLabel}</span>,
  },
  {
    accessorKey: "lessonCount",
    header: "Lessons",
    cell: (info) => <span className="num">{info.getValue() as number}</span>,
  },
  {
    accessorKey: "enrollmentCount",
    header: "Enrolled",
    cell: (info) => <span className="num">{info.getValue() as number}</span>,
  },
  {
    accessorKey: "updatedAt",
    header: "Updated",
    cell: (info) => (
      <span className="num text-xs font-medium text-muted-foreground">
        {info.row.original.updatedLabel}
      </span>
    ),
  },
];

export function CoursesTable({ data, empty }: { data: CourseRow[]; empty?: ReactNode }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(c) => `/admin/courses/${c.id}`}
      searchPlaceholder="Search courses…"
      empty={empty}
    />
  );
}
