"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { FormField, SelectInput, TextInput } from "@/components/form-field";

type Kind = "STANDALONE" | "COURSE";

export function CreateExamForm({
  courses,
  presetCourseId,
}: {
  courses: { value: string; label: string }[];
  presetCourseId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<Kind>(presetCourseId ? "COURSE" : "STANDALONE");
  const [courseId, setCourseId] = useState(presetCourseId);
  const [duration, setDuration] = useState("60");
  const [errors, setErrors] = useState<{ title?: string; code?: string; course?: string; duration?: string; form?: string }>({});
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!title.trim()) next.title = "Give the exam a title.";
    if (code.trim() && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(code.trim())) next.code = "Use letters, digits, - and _ only.";
    if (kind === "COURSE" && !courseId) next.course = "Choose the course this exam belongs to.";
    const minutes = parseInt(duration, 10);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) next.duration = "Between 1 and 1440 minutes.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    const res = await apiPost<{ id: string }>("/api/tenant/exams", {
      title: title.trim(),
      code: code.trim() || null,
      kind,
      courseId: kind === "COURSE" ? courseId : null,
      durationMin: minutes,
    });
    if (res.error) {
      setPending(false);
      if (res.error.code === "code_taken") return setErrors({ code: res.error.message });
      return setErrors({ form: res.error.message });
    }
    router.push(`/admin/exams/${res.data!.id}?tab=paper`);
  }

  return (
    <form onSubmit={submit} className="grid max-w-xl gap-5" noValidate>
      <FormField label="Title" htmlFor="exam-title" error={errors.title} required>
        <TextInput
          id="exam-title"
          name="title"
          autoComplete="off"
          placeholder="e.g. Mathematics 101 — Mid-term"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </FormField>
      <FormField
        label="Exam code (optional)"
        htmlFor="exam-code"
        error={errors.code}
        hint="A short reference such as MTH101-MID. It starts every candidate's Exam ID, and must be unique in your academy."
      >
        <TextInput
          id="exam-code"
          name="code"
          autoComplete="off"
          spellCheck={false}
          className="font-mono uppercase"
          maxLength={40}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </FormField>

      <div className="flex flex-col gap-1.5">
        <span id="exam-kind-label" className="text-[13px] font-bold">
          What kind of exam?
        </span>
        <Segmented<Kind>
          ariaLabel="Kind of exam"
          options={[
            { value: "STANDALONE", label: "Standalone" },
            { value: "COURSE", label: "Part of a course" },
          ]}
          value={kind}
          onChange={setKind}
          className="self-start"
        />
        <p className="text-xs font-medium text-muted-foreground">
          {kind === "STANDALONE"
            ? "Entrance exams, mocks and certification tests. You choose who sits it: learners, groups or external candidates."
            : "Sat by the course's learners, and can be added to the course as a lesson."}
        </p>
      </div>

      {kind === "COURSE" ? (
        <FormField label="Course" htmlFor="exam-course" error={errors.course} required>
          {courses.length ? (
            <SelectInput
              id="exam-course"
              placeholder="Choose a course…"
              options={courses}
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            />
          ) : (
            <p className="text-xs font-medium text-muted-foreground">There are no courses yet. Make this a standalone exam instead.</p>
          )}
        </FormField>
      ) : null}

      <FormField label="Duration (minutes)" htmlFor="exam-duration" error={errors.duration} hint="How long each candidate has once they start.">
        <TextInput
          id="exam-duration"
          type="number"
          inputMode="numeric"
          min={1}
          max={1440}
          className="max-w-40"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </FormField>

      {errors.form ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {errors.form}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create exam"}
        </Button>
      </div>
    </form>
  );
}
