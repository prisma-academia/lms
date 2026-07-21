"use client";

import { useState } from "react";
import { apiDelete, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormField, TextInput } from "@/components/form-field";
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
    if (!confirm("Delete this group? Lessons in it are kept but ungrouped.")) return;
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
        <DialogTitle>Lesson groups</DialogTitle>
        <DialogDescription>
          Organize lessons into groups (e.g. modules). Lessons are assigned to a group when added or
          edited.
        </DialogDescription>

        <div className="mt-5 flex flex-col gap-4">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No groups yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {groups.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 rounded-[10px] border-2 border-border bg-background px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-foreground">{g.title}</span>
                  {canWrite ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
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
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <FormField label="New group title" htmlFor="groups-dialog-title">
                  <TextInput
                    id="groups-dialog-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </FormField>
              </div>
              <Button type="button" onClick={addGroup} disabled={pending}>
                {pending ? "Adding…" : "Add group"}
              </Button>
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
