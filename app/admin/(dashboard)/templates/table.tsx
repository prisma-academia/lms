"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatTemplateType } from "@/lib/templates/types";

export type TemplateRow = {
  id: string;
  name: string;
  type: string;
  /** ISO timestamp for sorting; the label is what is shown. */
  createdAt: string;
  createdLabel: string;
};

const columns: ColumnDef<TemplateRow>[] = [
  { accessorKey: "name", header: "Name" },
  {
    id: "type",
    header: "Used for",
    // The words shown are what the search box matches.
    accessorFn: (row) => formatTemplateType(row.type),
    cell: (i) => <span className="text-xs">{i.getValue() as string}</span>,
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: (i) => (
      <span className="num whitespace-nowrap text-xs text-muted-foreground">
        {i.row.original.createdLabel}
      </span>
    ),
  },
];

export function TemplatesTable({ data, canCreate = true }: { data: TemplateRow[]; canCreate?: boolean }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(t) => `/admin/templates/${t.id}`}
      searchPlaceholder="Search templates…"
      empty={
        <EmptyState
          icon="file"
          title="No templates yet"
          action={
            canCreate ? (
              <Button asChild size="sm">
                <Link href="/admin/templates/new">New template</Link>
              </Button>
            ) : undefined
          }
        >
          A template is saved content you can reuse — the wording of an email, or the layout of a
          site page.
        </EmptyState>
      }
    />
  );
}
