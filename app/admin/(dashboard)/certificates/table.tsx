"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type CertRow = {
  id: string;
  name: string;
  linkedTo: string;
  awards: number;
};

const columns: ColumnDef<CertRow>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "linkedTo", header: "Linked to" },
  { accessorKey: "awards", header: "Awarded" },
];

export function CertificatesTable({ data }: { data: CertRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(c) => `/admin/certificates/${c.id}`}
      filterColumnId="name"
      searchPlaceholder="Search by name…"
    />
  );
}
