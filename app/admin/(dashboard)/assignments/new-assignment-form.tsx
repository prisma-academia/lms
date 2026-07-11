"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput, TextInput, TextArea } from "@/components/form-field";

export function NewAssignmentForm({
  courses,
}: {
  courses: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      setError("Create a course first.");
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
    setTitle("");
    setDescription("");
    setDueDate("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} disabled={courses.length === 0}>
        New assignment
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-[14px] border-2 border-ink bg-card p-5 shadow-brutal"
    >
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
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </FormField>
      <FormField label="Instructions (optional)" htmlFor="a-desc">
        <TextArea
          id="a-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Type" htmlFor="a-type">
          <SelectInput
            id="a-type"
            allowEmpty={false}
            options={[
              { value: "TEXT", label: "Text answer" },
              { value: "LINK", label: "Link" },
              { value: "FILE", label: "File link" },
            ]}
            value={type}
            onChange={(e) => setType(e.target.value as "TEXT" | "LINK" | "FILE")}
          />
        </FormField>
        <FormField label="Max points" htmlFor="a-max">
          <TextInput
            id="a-max"
            type="number"
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
      <label className="flex items-center gap-2 text-sm font-bold text-ink">
        <input
          type="checkbox"
          checked={publish}
          onChange={(e) => setPublish(e.target.checked)}
          className="size-4"
        />
        Publish now (visible to learners)
      </label>
      {error ? <p className="text-sm font-bold text-red">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create assignment"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
