"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type EnrollmentRow = {
  id: string;
  courseTitle: string;
  courseSlug: string;
  clientEmail: string;
  clientName: string;
  enrolledAt: string;
  completedAt: string | null;
  progressPercent: number;
};

const columns: ColumnDef<EnrollmentRow>[] = [
  { accessorKey: "courseTitle", header: "Course" },
  { accessorKey: "clientEmail", header: "Learner email" },
  { accessorKey: "clientName", header: "Learner name" },
  {
    accessorKey: "progressPercent",
    header: "Progress",
    cell: (info) => `${info.getValue() as number}%`,
  },
  {
    accessorKey: "enrolledAt",
    header: "Enrolled",
    cell: (info) => {
      const v = info.getValue() as string;
      return <span className="text-xs text-stone-500">{new Date(v).toLocaleString()}</span>;
    },
  },
  {
    accessorKey: "completedAt",
    header: "Completed",
    cell: (info) => {
      const v = info.getValue() as string | null;
      return (
        <span className="text-xs text-stone-500">
          {v ? new Date(v).toLocaleString() : "—"}
        </span>
      );
    },
  },
];

export function EnrollmentsTable({ data }: { data: EnrollmentRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumnId="clientEmail"
      searchPlaceholder="Search by email…"
    />
  );
}
