"use client";

import { useState } from "react";
import { apiDelete, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormField, TextInput } from "@/components/form-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { LessonGroupRow } from "./course-types";

export function GroupsDialog({
  courseId,
  groups,
  canWrite,
  open,
  onOpenChange,
  onAdded,
  onRemoved,
}: {
  courseId: string;
  groups: LessonGroupRow[];
  canWrite: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (group: LessonGroupRow) => void;
  onRemoved: (groupId: string) => void;
}) {
  const confirm = useConfirm();
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addGroup() {
    if (!title.trim()) return;
    setError(null);
    setPending(true);
    const res = await apiPost<{ group: LessonGroupRow }>(
      `/api/tenant/courses/${courseId}/lesson-groups`,
      { title: title.trim() }
    );
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.group) {
      onAdded(res.data.group);
      setTitle("");
    }
  }

  async function removeGroup(groupId: string) {
    const group = groups.find((g) => g.id === groupId);
    const ok = await confirm({
      title: group ? `Delete the module “${group.title}”?` : "Delete this module?",
      description: "Its lessons are kept and simply stop belonging to a module.",
      confirmLabel: "Delete module",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    const res = await apiDelete(`/api/tenant/courses/${courseId}/lesson-groups/${groupId}`);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    onRemoved(groupId);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Modules</DialogTitle>
        <DialogDescription>
          Modules group lessons into sections of the course. You choose a lesson&rsquo;s module
          when you add or edit the lesson.
        </DialogDescription>

        <div className="mt-5 flex flex-col gap-4">
          {groups.length === 0 ? (
            <p className="text-sm font-medium text-muted-foreground">
              No modules yet. Add the first one below.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {groups.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 rounded-[10px] border-2 border-border bg-background px-3 py-2 text-sm"
                >
                  <span className="min-w-0 break-words font-bold text-foreground">{g.title}</span>
                  {canWrite ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="shrink-0"
                      aria-label={`Delete the module “${g.title}”`}
                      onClick={() => removeGroup(g.id)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canWrite ? (
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                // Enter in the field adds the module, as people expect.
                e.preventDefault();
                void addGroup();
              }}
            >
              <div className="flex-1">
                <FormField label="New module" htmlFor="groups-dialog-title">
                  <TextInput
                    id="groups-dialog-title"
                    autoComplete="off"
                    placeholder="e.g. Week 1…"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </FormField>
              </div>
              <Button type="submit" disabled={pending || !title.trim()}>
                {pending ? "Adding…" : "Add module"}
              </Button>
            </form>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm font-bold text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
