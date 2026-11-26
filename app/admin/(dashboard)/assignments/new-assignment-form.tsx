"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormField, SelectInput, TextInput, TextArea } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/ui/toast";

type Course = { id: string; title: string };

/**
 * "New assignment", as a button that opens the form in a dialog.
 *
 * The form used to unfold inside the page header's action slot, which is a
 * narrow box pinned to the right of the title: on a phone it pushed the title
 * off-screen, and on a desktop it squeezed seven fields into a column a few
 * hundred pixels wide. A dialog gives it room and returns focus to the button.
 */
export function NewAssignmentForm({ courses }: { courses: Course[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={courses.length === 0}
        title={courses.length === 0 ? "Create a course first" : undefined}
      >
        <Icon name="plus" aria-hidden />
        New assignment
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Mounted only while open, so the fields start empty every time. */}
        {open ? <AssignmentFields courses={courses} onDone={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  );
}

function AssignmentFields({ courses, onDone }: { courses: Course[]; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"TEXT" | "LINK" | "FILE">("TEXT");
  const [maxPoints, setMaxPoints] = useState("100");
  const [dueDate, setDueDate] = useState("");
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!courseId) {
      setError("Choose the course this assignment belongs to.");
      return;
    }
    if (!title.trim()) {
      setError("Give the assignment a title.");
      return;
    }
    setPending(true);
    const res = await apiPost<{ assignment: { id: string } }>(
      "/api/tenant/assignments",
      {
        courseId,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        maxPoints: Number(maxPoints) || 100,
        dueAt: dueDate ? new Date(dueDate + "T23:59:00").toISOString() : null,
        publish,
      }
    );
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast(publish ? "Assignment published." : "Assignment saved as a draft.");
    onDone();
    router.refresh();
  }

  return (
    <DialogContent className="max-w-xl">
      <DialogTitle>New assignment</DialogTitle>
      <DialogDescription>
        Learners in the course see it once it is published, and hand in their work from their
        Tasks page.
      </DialogDescription>

      <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-4">
        <FormField label="Course" htmlFor="a-course">
          <SelectInput
            id="a-course"
            allowEmpty={false}
            options={courses.map((c) => ({ value: c.id, label: c.title }))}
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          />
        </FormField>
        <FormField label="Title" htmlFor="a-title">
          <TextInput
            id="a-title"
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </FormField>
        <FormField
          label="Instructions (optional)"
          htmlFor="a-desc"
          hint="What learners should do, and what a good answer looks like."
        >
          <TextArea
            id="a-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Learners hand in" htmlFor="a-type">
            <SelectInput
              id="a-type"
              allowEmpty={false}
              options={[
                { value: "TEXT", label: "Written answer" },
                { value: "LINK", label: "A link" },
                { value: "FILE", label: "A link to a file" },
              ]}
              value={type}
              onChange={(e) => setType(e.target.value as "TEXT" | "LINK" | "FILE")}
            />
          </FormField>
          <FormField label="Marked out of" htmlFor="a-max">
            <TextInput
              id="a-max"
              type="number"
              inputMode="numeric"
              min="1"
              max="1000"
              value={maxPoints}
              onChange={(e) => setMaxPoints(e.target.value)}
            />
          </FormField>
          <FormField label="Due date (optional)" htmlFor="a-due">
            <TextInput
              id="a-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </FormField>
        </div>
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="a-publish"
            checked={publish}
            onCheckedChange={(v) => setPublish(v === true)}
            className="mt-0.5"
          />
          <label htmlFor="a-publish" className="text-sm font-bold text-foreground">
            Publish straight away
            <span className="block text-xs font-medium text-muted-foreground">
              Untick to save it as a draft that learners cannot see yet.
            </span>
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-sm font-bold text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 border-t-2 border-dashed border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : publish ? "Create and publish" : "Save draft"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
