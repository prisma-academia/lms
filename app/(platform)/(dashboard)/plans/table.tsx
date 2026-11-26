"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

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
  { accessorKey: "price", header: "Monthly price" },
  { accessorKey: "storageGb", header: "Storage" },
  { accessorKey: "isPublic", header: "Visibility" },
  { accessorKey: "tenants", header: "Academies" },
];

export function PlansTable({ data }: { data: PlanRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(p) => `/plans/${p.id}`}
      searchPlaceholder="Search plans…"
      empty={
        <EmptyState
          icon="credit-card"
          title="No plans yet"
          action={
            <Button asChild size="sm">
              <Link href="/plans/new">New plan</Link>
            </Button>
          }
        >
          A plan sets a monthly price and the storage, learner and course limits that come with it.
        </EmptyState>
      }
    />
  );
}
