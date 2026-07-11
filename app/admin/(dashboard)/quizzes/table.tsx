"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type QuizRow = {
  id: string;
  title: string;
  questions: number;
  attempts: number;
  passingScore: string;
};

const columns: ColumnDef<QuizRow>[] = [
  { accessorKey: "title", header: "Title" },
  { accessorKey: "questions", header: "Questions" },
  { accessorKey: "attempts", header: "Attempts" },
  { accessorKey: "passingScore", header: "Pass mark" },
];

export function QuizzesTable({ data }: { data: QuizRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(q) => `/admin/quizzes/${q.id}`}
      filterColumnId="title"
      searchPlaceholder="Search by title…"
    />
  );
}
