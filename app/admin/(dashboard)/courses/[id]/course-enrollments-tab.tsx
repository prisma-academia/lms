"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { apiDelete, apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { EnrollDialog } from "./enroll-dialog";
import type { ClientOption, CourseEnrollmentRow } from "./course-types";

export function CourseEnrollmentsTab({
  courseId,
  initialEnrollments,
  clients,
  canManage,
}: {
  courseId: string;
  initialEnrollments: CourseEnrollmentRow[];
  clients: ClientOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState(initialEnrollments);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resetProgress(row: CourseEnrollmentRow) {
    if (!confirm(`Reset all progress for ${row.clientEmail}?`)) return;
    setError(null);
    const res = await apiPatch<{ enrollment: CourseEnrollmentRow }>(
      `/api/tenant/enrollments/${row.id}`,
      { action: "reset-progress" }
    );
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, progressPercent: 0, completedAt: null } : r))
    );
    toast("Progress reset.");
    router.refresh();
  }

  async function unenroll(row: CourseEnrollmentRow) {
    if (!confirm(`Unenroll ${row.clientEmail} from this course? Their progress is deleted.`)) return;
    setError(null);
    const res = await apiDelete(`/api/tenant/enrollments/${row.id}`);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast("Learner unenrolled.");
    router.refresh();
  }

  const columns: ColumnDef<CourseEnrollmentRow, unknown>[] = [
    { accessorKey: "clientEmail", header: "Learner email" },
    { accessorKey: "clientName", header: "Learner name" },
    {
      accessorKey: "progressPercent",
      header: "Progress",
      cell: (info) => `${info.getValue() as number}%`,
    },
    {
      accessorKey: "enrolledAt",
      header: "Enrolled",
      cell: (info) => (
        <span className="text-xs text-stone-500">
          {new Date(info.getValue() as string).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "completedAt",
      header: "Completed",
      cell: (info) => {
        const v = info.getValue() as string | null;
        return (
          <span className="text-xs text-stone-500">{v ? new Date(v).toLocaleString() : "—"}</span>
        );
      },
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "",
            enableSorting: false,
            cell: (info) => {
              const row = info.row.original;
              return (
                <div className="flex justify-end gap-1.5">
                  <Button variant="outline" size="xs" onClick={() => resetProgress(row)}>
                    Reset progress
                  </Button>
                  <Button variant="destructive" size="xs" onClick={() => unenroll(row)}>
                    Unenroll
                  </Button>
                </div>
              );
            },
          } satisfies ColumnDef<CourseEnrollmentRow, unknown>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase text-stone-500">Enrollments</h2>
          <p className="mt-1 text-xs text-stone-500">
            {rows.length} learner{rows.length === 1 ? "" : "s"} enrolled in this course.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setEnrollOpen(true)}>
            <Icon name="plus" />
            Enroll learner
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <DataTable
        columns={columns}
        data={rows}
        filterColumnId="clientEmail"
        searchPlaceholder="Search by email…"
        empty={
          <EmptyState icon="users" title="No enrollments yet">
            Enroll a learner manually or share the course with your audience.
          </EmptyState>
        }
      />

      {canManage ? (
        <EnrollDialog
          courseId={courseId}
          clients={clients}
          open={enrollOpen}
          onOpenChange={setEnrollOpen}
          onEnrolled={(enrollment) => {
            setRows((prev) => [enrollment, ...prev.filter((r) => r.id !== enrollment.id)]);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
