"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export type CertRow = {
  id: string;
  name: string;
  linkedTo: string;
  awards: number;
};

const columns: ColumnDef<CertRow>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "linkedTo", header: "Awarded for" },
  {
    accessorKey: "awards",
    header: "Times awarded",
    cell: (info) => <span className="num">{info.getValue() as number}</span>,
  },
];

export function CertificatesTable({ data, canCreate = true }: { data: CertRow[]; canCreate?: boolean }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(c) => `/admin/certificates/${c.id}`}
      searchPlaceholder="Search certificates…"
      empty={
        <EmptyState
          icon="award"
          title="No certificates yet"
          action={
            canCreate ? (
              <Button asChild size="sm">
                <Link href="/admin/certificates/new">New certificate</Link>
              </Button>
            ) : undefined
          }
        >
          Design a certificate and link it to a course or programme, and learners receive it
          automatically when they finish.
        </EmptyState>
      }
    />
  );
}
