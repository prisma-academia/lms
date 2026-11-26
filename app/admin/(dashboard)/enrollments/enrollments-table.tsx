"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type EnrollmentRow = {
  id: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  clientEmail: string;
  clientName: string;
  /** ISO strings, kept for sorting. */
  enrolledAt: string;
  completedAt: string | null;
  /** The same moments as people read them, formatted on the server. */
  enrolledLabel: string;
  completedLabel: string | null;
  progressPercent: number;
};

const columns: ColumnDef<EnrollmentRow>[] = [
  {
    id: "learner",
    header: "Learner",
    // Name and email in one value, so searching finds a learner by either.
    accessorFn: (r) => `${r.clientName} ${r.clientEmail}`.trim(),
    cell: (info) => {
      const row = info.row.original;
      return (
        <span className="block min-w-40 max-w-xs">
          <span className="block truncate font-bold text-foreground">
            {row.clientName || row.clientEmail}
          </span>
          {row.clientName ? (
            <span className="block truncate text-xs font-medium text-muted-foreground">
              {row.clientEmail}
            </span>
          ) : null}
        </span>
      );
    },
  },
  {
    accessorKey: "courseTitle",
    header: "Course",
    cell: (info) => (
      <span className="block min-w-40 max-w-sm truncate font-medium">{info.getValue() as string}</span>
    ),
  },
  {
    accessorKey: "progressPercent",
    header: "Progress",
    cell: (info) => {
      const percent = info.getValue() as number;
      return (
        <span className="flex min-w-28 items-center gap-2">
          {/* The number beside it is the value; the bar is the same value drawn. */}
          <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-full border border-border bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </span>
          <span className="num w-9 shrink-0 text-right text-xs font-bold">{percent}%</span>
        </span>
      );
    },
  },
  {
    accessorKey: "enrolledAt",
    header: "Enrolled",
    cell: (info) => (
      <span className="num text-xs font-medium text-muted-foreground">
        {info.row.original.enrolledLabel}
      </span>
    ),
  },
  {
    accessorKey: "completedAt",
    header: "Finished",
    cell: (info) => (
      <span className="num text-xs font-medium text-muted-foreground">
        {info.row.original.completedLabel ?? "—"}
      </span>
    ),
  },
];

export function EnrollmentsTable({
  data,
  empty,
  linkToCourse,
}: {
  data: EnrollmentRow[];
  empty?: ReactNode;
  /** Whether this viewer may open courses; rows only link there if they can. */
  linkToCourse: boolean;
}) {
  return (
    <DataTable
      columns={columns}
      data={data}
      // Opens the course, where a learner's enrollment can be managed.
      rowHref={linkToCourse ? (e) => `/admin/courses/${e.courseId}?tab=enrollments` : undefined}
      searchPlaceholder="Search by learner or course…"
      empty={empty}
    />
  );
}
