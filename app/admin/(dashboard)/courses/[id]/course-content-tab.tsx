"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { apiDelete, apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { LessonDialog } from "./lesson-dialog";
import { GroupsDialog } from "./groups-dialog";
import type { CourseInitial, LessonRow } from "./course-types";

export function CourseContentTab({
  initial,
  canWrite,
  quizzes,
  libraryItems,
}: {
  initial: CourseInitial;
  canWrite: boolean;
  quizzes: { id: string; title: string }[];
  libraryItems: { id: string; name: string; key: string }[];
}) {
  const router = useRouter();
  const [lessons, setLessons] = useState(initial.lessons);
  const [groups, setGroups] = useState(initial.lessonGroups);
  const [error, setError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const [lessonDialogOpen, setLessonDialogOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<LessonRow | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);

  function groupName(id: string | null): string {
    return id ? groups.find((g) => g.id === id)?.title ?? "—" : "—";
  }

  function openCreate() {
    setEditingLesson(null);
    setLessonDialogOpen(true);
  }

  function openEdit(lesson: LessonRow) {
    setEditingLesson(lesson);
    setLessonDialogOpen(true);
  }

  function onLessonSaved(lesson: LessonRow, isNew: boolean) {
    setLessons((prev) =>
      isNew ? [...prev, lesson] : prev.map((l) => (l.id === lesson.id ? lesson : l))
    );
    router.refresh();
  }

  async function removeLesson(lessonId: string) {
    if (!confirm("Delete this lesson?")) return;
    setError(null);
    const res = await apiDelete(`/api/tenant/courses/${initial.id}/lessons/${lessonId}`);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setLessons((prev) => prev.filter((l) => l.id !== lessonId));
    router.refresh();
  }

  /** Swap a lesson with its neighbor and persist both new positions. */
  async function moveLesson(lessonId: string, dir: -1 | 1) {
    if (reordering) return;
    const index = lessons.findIndex((l) => l.id === lessonId);
    const j = index + dir;
    if (index < 0 || j < 0 || j >= lessons.length) return;

    const prev = lessons;
    const next = [...lessons];
    [next[index], next[j]] = [next[j], next[index]];
    setError(null);
    setReordering(true);
    setLessons(next);

    const [r1, r2] = await Promise.all([
      apiPatch(`/api/tenant/courses/${initial.id}/lessons/${next[index].id}`, {
        sortOrder: index,
      }),
      apiPatch(`/api/tenant/courses/${initial.id}/lessons/${next[j].id}`, { sortOrder: j }),
    ]);
    setReordering(false);
    if (r1.error || r2.error) {
      setLessons(prev);
      setError((r1.error ?? r2.error)!.message);
      return;
    }
    router.refresh();
  }

  const columns: ColumnDef<LessonRow, unknown>[] = [
    {
      id: "order",
      header: "#",
      cell: (info) => (
        <span className="text-xs font-bold text-muted-foreground">{info.row.index + 1}</span>
      ),
      enableSorting: false,
    },
    { accessorKey: "title", header: "Title" },
    {
      accessorKey: "contentType",
      header: "Type",
      cell: (info) => (
        <span className="rounded-[8px] border-2 border-border bg-muted px-2 py-0.5 text-[11px] font-bold uppercase">
          {info.getValue() as string}
        </span>
      ),
    },
    {
      id: "group",
      accessorFn: (row) => groupName(row.groupId),
      header: "Group",
      cell: (info) => (
        <span className="text-xs text-muted-foreground">{info.getValue() as string}</span>
      ),
    },
    {
      accessorKey: "durationMin",
      header: "Duration",
      cell: (info) => {
        const v = info.getValue() as number | null;
        return <span className="text-xs text-muted-foreground">{v != null ? `${v} min` : "—"}</span>;
      },
    },
    ...(canWrite
      ? [
          {
            id: "actions",
            header: "",
            enableSorting: false,
            cell: (info) => {
              const lesson = info.row.original;
              const idx = info.row.index;
              return (
                <div className="flex justify-end gap-1.5">
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label="Move up"
                    disabled={idx === 0 || reordering}
                    onClick={() => moveLesson(lesson.id, -1)}
                  >
                    <Icon name="chevron-up" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label="Move down"
                    disabled={idx === lessons.length - 1 || reordering}
                    onClick={() => moveLesson(lesson.id, 1)}
                  >
                    <Icon name="chevron-down" />
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => openEdit(lesson)}>
                    Edit
                  </Button>
                  <Button variant="destructive" size="xs" onClick={() => removeLesson(lesson.id)}>
                    Delete
                  </Button>
                </div>
              );
            },
          } satisfies ColumnDef<LessonRow, unknown>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase text-stone-500">Lessons</h2>
          <p className="mt-1 text-xs text-stone-500">
            {lessons.length} lesson{lessons.length === 1 ? "" : "s"} in {groups.length} group
            {groups.length === 1 ? "" : "s"}.
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <Link href={`/admin/courses/${initial.id}/builder`}>
                <Icon name="sparkles" />
                AI builder
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setGroupsOpen(true)}>
              Manage groups
            </Button>
            <Button onClick={openCreate}>
              <Icon name="plus" />
              Add lesson
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <DataTable
        columns={columns}
        data={lessons}
        filterColumnId="title"
        searchPlaceholder="Search lessons…"
        empty={
          <EmptyState icon="book" title="No lessons yet">
            Add a lesson or generate a full course with the AI builder.
          </EmptyState>
        }
      />

      <LessonDialog
        courseId={initial.id}
        lesson={editingLesson}
        groups={groups}
        quizzes={quizzes}
        libraryItems={libraryItems}
        open={lessonDialogOpen}
        onOpenChange={setLessonDialogOpen}
        onSaved={onLessonSaved}
      />

      <GroupsDialog
        courseId={initial.id}
        groups={groups}
        canWrite={canWrite}
        open={groupsOpen}
        onOpenChange={setGroupsOpen}
        onAdded={(group) => {
          setGroups((prev) => [...prev, group]);
          router.refresh();
        }}
        onRemoved={(groupId) => {
          setGroups((prev) => prev.filter((g) => g.id !== groupId));
          setLessons((prev) =>
            prev.map((l) => (l.groupId === groupId ? { ...l, groupId: null } : l))
          );
          router.refresh();
        }}
      />
    </div>
  );
}
