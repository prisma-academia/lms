"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export type QuizRow = {
  id: string;
  title: string;
  questions: number;
  attempts: number;
  passingScore: string;
};

const columns: ColumnDef<QuizRow>[] = [
  { accessorKey: "title", header: "Title" },
  {
    accessorKey: "questions",
    header: "Questions",
    cell: (info) => <span className="num">{info.getValue() as number}</span>,
  },
  {
    accessorKey: "attempts",
    header: "Attempts",
    cell: (info) => <span className="num">{info.getValue() as number}</span>,
  },
  {
    accessorKey: "passingScore",
    header: "Pass mark",
    cell: (info) => <span className="num">{info.getValue() as string}</span>,
  },
];

export function QuizzesTable({ data, canCreate = true }: { data: QuizRow[]; canCreate?: boolean }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(q) => `/admin/quizzes/${q.id}`}
      searchPlaceholder="Search quizzes…"
      empty={
        <EmptyState
          icon="clipboard"
          title="No quizzes yet"
          action={
            canCreate ? (
              <Button asChild size="sm">
                <Link href="/admin/quizzes/new">New quiz</Link>
              </Button>
            ) : undefined
          }
        >
          A quiz checks what learners took from a lesson. Build one from the questions in your
          question banks, then add it to a course.
        </EmptyState>
      }
    />
  );
}
