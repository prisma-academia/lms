"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { apiDelete, apiPatch } from "@/lib/client/api";
import { withViewTransition } from "@/lib/client/view-transition";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { LessonDialog } from "./lesson-dialog";
import { GroupsDialog } from "./groups-dialog";
import type { CourseInitial, LessonContentType, LessonRow } from "./course-types";

/** What a lesson is, in the words an author uses — not the storage type. */
const TYPE_LABELS: Record<LessonContentType, string> = {
  TEXT: "Reading",
  HTML: "Reading",
  VIDEO_URL: "Video",
  FILE: "File",
  QUIZ: "Quiz",
};

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
  const confirm = useConfirm();
  const { toast } = useToast();
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
    const lesson = lessons.find((l) => l.id === lessonId);
    const ok = await confirm({
      title: lesson ? `Delete “${lesson.title}”?` : "Delete this lesson?",
      description:
        "The lesson and learners' progress on it are removed from this course. This cannot be undone.",
      confirmLabel: "Delete lesson",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    const res = await apiDelete(`/api/tenant/courses/${initial.id}/lessons/${lessonId}`);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setLessons((prev) => prev.filter((l) => l.id !== lessonId));
    toast("Lesson deleted.");
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
    withViewTransition(() => setLessons(next));

    const [r1, r2] = await Promise.all([
      apiPatch(`/api/tenant/courses/${initial.id}/lessons/${next[index].id}`, {
        sortOrder: index,
      }),
      apiPatch(`/api/tenant/courses/${initial.id}/lessons/${next[j].id}`, { sortOrder: j }),
    ]);
    setReordering(false);
    if (r1.error || r2.error) {
      withViewTransition(() => setLessons(prev));
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
        <span className="num text-xs font-bold text-muted-foreground">{info.row.index + 1}</span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "title",
      header: "Lesson",
      cell: (info) => (
        <span className="block min-w-40 max-w-md truncate font-bold text-foreground">
          {info.getValue() as string}
        </span>
      ),
    },
    {
      id: "contentType",
      accessorFn: (row) => TYPE_LABELS[row.contentType] ?? row.contentType,
      header: "Type",
      cell: (info) => (
        <span className="whitespace-nowrap rounded-[8px] border-2 border-border bg-muted px-2 py-0.5 text-[11px] font-bold">
          {info.getValue() as string}
        </span>
      ),
    },
    {
      id: "group",
      accessorFn: (row) => groupName(row.groupId),
      header: "Module",
      cell: (info) => (
        <span className="text-xs font-medium text-muted-foreground">{info.getValue() as string}</span>
      ),
    },
    {
      accessorKey: "durationMin",
      header: "Duration",
      cell: (info) => {
        const v = info.getValue() as number | null;
        return (
          <span className="num whitespace-nowrap text-xs font-medium text-muted-foreground">
            {v != null ? `${v} min` : "—"}
          </span>
        );
      },
    },
    ...(canWrite
      ? [
          {
            id: "actions",
            header: () => <span className="sr-only">Actions</span>,
            enableSorting: false,
            cell: (info) => {
              const lesson = info.row.original;
              const idx = info.row.index;
              return (
                <div className="flex justify-end gap-1.5">
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Move “${lesson.title}” up`}
                    disabled={idx === 0 || reordering}
                    onClick={() => moveLesson(lesson.id, -1)}
                  >
                    <Icon name="chevron-up" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Move “${lesson.title}” down`}
                    disabled={idx === lessons.length - 1 || reordering}
                    onClick={() => moveLesson(lesson.id, 1)}
                  >
                    <Icon name="chevron-down" />
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    aria-label={`Edit “${lesson.title}”`}
                    onClick={() => openEdit(lesson)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="xs"
                    aria-label={`Delete “${lesson.title}”`}
                    onClick={() => removeLesson(lesson.id)}
                  >
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
          <h2 className="font-heading text-lg leading-tight">Lessons</h2>
          <p className="num mt-1 text-[13px] font-medium text-muted-foreground">
            {lessons.length} lesson{lessons.length === 1 ? "" : "s"} in {groups.length} module
            {groups.length === 1 ? "" : "s"}. Learners take them in this order.
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <Link href={`/admin/courses/${initial.id}/builder`}>
                <Icon name="sparkles" aria-hidden />
                AI builder
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setGroupsOpen(true)}>
              Manage modules
            </Button>
            <Button onClick={openCreate}>
              <Icon name="plus" aria-hidden />
              Add lesson
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        data={lessons}
        getRowId={(row) => row.id}
        rowStyle={(row) => ({ viewTransitionName: `course-lesson-${row.id}` })}
        searchPlaceholder="Search lessons…"
        empty={
          <EmptyState
            icon="book"
            title="No lessons yet"
            action={
              canWrite ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={openCreate}>
                    <Icon name="plus" aria-hidden />
                    Add lesson
                  </Button>
                  <Button variant="secondary" asChild>
                    <Link href={`/admin/courses/${initial.id}/builder`}>
                      <Icon name="sparkles" aria-hidden />
                      Draft with AI
                    </Link>
                  </Button>
                </div>
              ) : undefined
            }
          >
            Write the first lesson yourself, or have the AI builder draft the whole course for you
            to edit.
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
