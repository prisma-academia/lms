"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type PlanRow = {
  id: string;
  code: string;
  name: string;
  price: string;
  storageGb: string;
  isPublic: string;
  tenants: number;
};

const columns: ColumnDef<PlanRow>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "code", header: "Code" },
  { accessorKey: "price", header: "Monthly" },
  { accessorKey: "storageGb", header: "Storage" },
  { accessorKey: "isPublic", header: "Visibility" },
  { accessorKey: "tenants", header: "Tenants" },
];

export function PlansTable({ data }: { data: PlanRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(p) => `/plans/${p.id}`}
      filterColumnId="name"
      searchPlaceholder="Search by name…"
    />
  );
}
