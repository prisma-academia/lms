"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

export type MessageRow = {
  id: string;
  subject: string;
  category: string;
  audience: string;
  recipients: number;
  createdAt: string;
};

const columns: ColumnDef<MessageRow>[] = [
  { accessorKey: "subject", header: "Subject" },
  { accessorKey: "category", header: "Category" },
  { accessorKey: "audience", header: "Audience" },
  { accessorKey: "recipients", header: "Recipients" },
  {
    accessorKey: "createdAt",
    header: "Sent",
    cell: (info) => (
      <span className="text-xs text-stone-500">{new Date(info.getValue() as string).toLocaleString()}</span>
    ),
  },
];

export function MessagesTable({ data }: { data: MessageRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(m) => `/admin/messages/${m.id}`}
      filterColumnId="subject"
      searchPlaceholder="Search by subject…"
    />
  );
}
