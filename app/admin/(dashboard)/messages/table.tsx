"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

export type MessageRow = {
  id: string;
  subject: string;
  category: string;
  audience: string;
  recipients: number;
  /** ISO string, kept for sorting. */
  createdAt: string;
  /** Formatted on the server in the academy's locale and time zone. */
  sentLabel: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  MESSAGE: "Message",
  ANNOUNCEMENT: "Announcement",
  REMINDER: "Reminder",
};

const AUDIENCE_LABELS: Record<string, string> = {
  ALL: "All learners",
  CLIENT: "One learner",
  GROUP: "A learner group",
};

const columns: ColumnDef<MessageRow>[] = [
  {
    accessorKey: "subject",
    header: "Subject",
    cell: (info) => (
      <span className="block min-w-40 max-w-md truncate font-bold text-foreground">
        {info.getValue() as string}
      </span>
    ),
  },
  {
    id: "category",
    header: "Kind",
    accessorFn: (r) => CATEGORY_LABELS[r.category] ?? r.category,
    cell: (info) => <Badge>{info.getValue() as string}</Badge>,
  },
  {
    id: "audience",
    header: "Sent to",
    accessorFn: (r) => AUDIENCE_LABELS[r.audience] ?? r.audience,
  },
  {
    accessorKey: "recipients",
    header: "Recipients",
    cell: (info) => <span className="num">{info.getValue() as number}</span>,
  },
  {
    accessorKey: "createdAt",
    header: "Sent",
    cell: (info) => (
      <span className="num text-xs font-medium text-muted-foreground">
        {info.row.original.sentLabel}
      </span>
    ),
  },
];

export function MessagesTable({ data, empty }: { data: MessageRow[]; empty?: ReactNode }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(m) => `/admin/messages/${m.id}`}
      searchPlaceholder="Search messages…"
      empty={empty}
    />
  );
}
