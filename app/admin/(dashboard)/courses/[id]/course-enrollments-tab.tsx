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
import { useConfirm } from "@/components/ui/confirm-dialog";
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
  const confirm = useConfirm();
  const [rows, setRows] = useState(initialEnrollments);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resetProgress(row: CourseEnrollmentRow) {
    const ok = await confirm({
      title: `Reset progress for ${row.clientName || row.clientEmail}?`,
      description:
        "Every lesson is marked as not done and they start the course again from the first one. This cannot be undone.",
      confirmLabel: "Reset progress",
      destructive: true,
    });
    if (!ok) return;
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
      prev.map((r) =>
        r.id === row.id ? { ...r, progressPercent: 0, completedAt: null, completedLabel: null } : r
      )
    );
    toast("Progress reset.");
    router.refresh();
  }

  async function unenroll(row: CourseEnrollmentRow) {
    const ok = await confirm({
      title: `Remove ${row.clientName || row.clientEmail} from this course?`,
      description:
        "They lose access to the course and their progress in it is deleted. This cannot be undone.",
      confirmLabel: "Remove learner",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    const res = await apiDelete(`/api/tenant/enrollments/${row.id}`);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast("Learner removed from the course.");
    router.refresh();
  }

  const columns: ColumnDef<CourseEnrollmentRow, unknown>[] = [
    {
      id: "learner",
      header: "Learner",
      // Name and email in one value, so searching finds a learner by either.
      accessorFn: (row) => `${row.clientName} ${row.clientEmail}`.trim(),
      cell: (info) => {
        const row = info.row.original;
        return (
          <span className="block min-w-40 max-w-xs">
            <span className="block truncate font-bold text-foreground">
              {row.clientName || row.clientEmail}
            </span>
            {row.clientName ? (
              <span className="block truncate text-xs font-medium text-muted-foreground">
                {row.clientEmail}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      accessorKey: "progressPercent",
      header: "Progress",
      cell: (info) => <span className="num">{info.getValue() as number}%</span>,
    },
    {
      accessorKey: "enrolledAt",
      header: "Enrolled",
      cell: (info) => (
        <span className="num text-xs font-medium text-muted-foreground">
          {info.row.original.enrolledLabel}
        </span>
      ),
    },
    {
      accessorKey: "completedAt",
      header: "Finished",
      cell: (info) => (
        <span className="num text-xs font-medium text-muted-foreground">
          {info.row.original.completedLabel ?? "—"}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: () => <span className="sr-only">Actions</span>,
            enableSorting: false,
            cell: (info) => {
              const row = info.row.original;
              const who = row.clientName || row.clientEmail;
              return (
                <div className="flex justify-end gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    aria-label={`Reset progress for ${who}`}
                    onClick={() => resetProgress(row)}
                  >
                    Reset progress
                  </Button>
                  <Button
                    variant="destructive"
                    size="xs"
                    aria-label={`Remove ${who} from this course`}
                    onClick={() => unenroll(row)}
                  >
                    Remove
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
          <h2 className="font-heading text-lg leading-tight">Enrolled learners</h2>
          <p className="num mt-1 text-[13px] font-medium text-muted-foreground">
            {rows.length} learner{rows.length === 1 ? "" : "s"} enrolled in this course.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setEnrollOpen(true)}>
            <Icon name="plus" aria-hidden />
            Enroll a learner
          </Button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search learners…"
        empty={
          <EmptyState
            icon="users"
            title="Nobody is enrolled yet"
            action={
              canManage ? (
                <Button onClick={() => setEnrollOpen(true)}>
                  <Icon name="plus" aria-hidden />
                  Enroll a learner
                </Button>
              ) : undefined
            }
          >
            Enroll learners yourself, or publish the course and share its link so they can join.
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
