"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type ProgrammeRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  courseCount: number;
  createdAt: string;
};

const columns: ColumnDef<ProgrammeRow>[] = [
  { accessorKey: "title", header: "Title" },
  { accessorKey: "slug", header: "Slug" },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "courseCount", header: "Courses" },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: (info) => (
      <span className="text-xs text-stone-500">
        {new Date(info.getValue() as string).toLocaleDateString()}
      </span>
    ),
  },
];

export function ProgrammesTable({ data }: { data: ProgrammeRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(p) => `/admin/programmes/${p.id}`}
      filterColumnId="title"
      searchPlaceholder="Search by title…"
    />
  );
}
