"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type CourseRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  priceCents: number | null;
  currency: string;
  lessonCount: number;
  enrollmentCount: number;
  updatedAt: string;
};

function formatPrice(cents: number | null, currency: string) {
  if (cents == null || cents === 0) return "Free";
  return `${currency} ${(cents / 100).toLocaleString()}`;
}

const columns: ColumnDef<CourseRow>[] = [
  { accessorKey: "title", header: "Title" },
  { accessorKey: "slug", header: "Slug" },
  { accessorKey: "status", header: "Status" },
  {
    id: "price",
    header: "Price",
    accessorFn: (r) => formatPrice(r.priceCents, r.currency),
  },
  { accessorKey: "lessonCount", header: "Lessons" },
  { accessorKey: "enrollmentCount", header: "Enrollments" },
  {
    accessorKey: "updatedAt",
    header: "Updated",
    cell: (info) => {
      const v = info.getValue() as string;
      return <span className="text-xs text-stone-500">{new Date(v).toLocaleString()}</span>;
    },
  },
];

export function CoursesTable({ data }: { data: CourseRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(c) => `/admin/courses/${c.id}`}
      filterColumnId="title"
      searchPlaceholder="Search by title…"
    />
  );
}
