"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export type BankRow = {
  id: string;
  name: string;
  description: string | null;
  questions: number;
  restricted: string;
};

const columns: ColumnDef<BankRow>[] = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "questions",
    header: "Questions",
    cell: (info) => <span className="num">{info.getValue() as number}</span>,
  },
  {
    accessorKey: "restricted",
    header: "Who can use it",
    cell: (info) =>
      (info.getValue() as string) === "Restricted" ? <Badge>Selected groups</Badge> : "All staff",
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: (info) => (
      <span className="line-clamp-2 max-w-md text-muted-foreground">
        {(info.getValue() as string | null) ?? "—"}
      </span>
    ),
  },
];

export function QuestionBanksTable({ data, canCreate = true }: { data: BankRow[]; canCreate?: boolean }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(b) => `/admin/question-banks/${b.id}`}
      searchPlaceholder="Search question banks…"
      empty={
        <EmptyState
          icon="layers"
          title="No question banks yet"
          action={
            canCreate ? (
              <Button asChild size="sm">
                <Link href="/admin/question-banks/new">New bank</Link>
              </Button>
            ) : undefined
          }
        >
          A question bank is a collection of questions on one topic. Write them once here, then
          reuse them in any quiz.
        </EmptyState>
      }
    />
  );
}
