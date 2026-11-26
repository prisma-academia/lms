"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { FormField, SelectInput } from "@/components/form-field";
import { useToast } from "@/components/ui/toast";

type Option = { value: string; label: string };

export function ManualEnroll({ courses, clients }: { courses: Option[]; clients: Option[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [courseId, setCourseId] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function enroll(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !clientId) {
      setError("Choose both a course and a learner.");
      return;
    }
    setError(null);
    setPending(true);
    const res = await apiPost("/api/tenant/enrollments", { courseId, clientId });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast("Learner enrolled.");
    // Keep the course selected: enrolling several learners into one course is
    // the common case.
    setClientId("");
    router.refresh();
  }

  return (
    <Card className="mb-6">
      <h2 className="font-heading text-lg leading-tight">Enroll a learner</h2>
      <p className="mt-1 text-[13px] font-medium text-muted-foreground">
        Gives a learner access to any published course straight away, including private and paid
        ones.
      </p>
      <form onSubmit={enroll} noValidate>
        <div className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-2">
          <FormField
            label="Course"
            htmlFor="me-course"
            hint={courses.length === 0 ? "No published courses yet. Publish one first." : undefined}
          >
            <SelectInput
              id="me-course"
              placeholder="Choose a course…"
              options={courses}
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            />
          </FormField>
          <FormField
            label="Learner"
            htmlFor="me-client"
            hint={clients.length === 0 ? "No learners yet. Add one under Learners first." : undefined}
          >
            <SelectInput
              id="me-client"
              placeholder="Choose a learner…"
              options={clients}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </FormField>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm font-bold text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-4">
          <Button type="submit" disabled={pending}>
            {pending ? "Enrolling…" : "Enroll learner"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
