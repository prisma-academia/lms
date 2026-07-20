"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { FormField, SelectInput } from "@/components/form-field";

type Option = { value: string; label: string };

export function ManualEnroll({ courses, clients }: { courses: Option[]; clients: Option[] }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function enroll() {
    if (!courseId || !clientId) {
      setError("Select a course and a learner.");
      return;
    }
    setError(null);
    setInfo(null);
    setPending(true);
    const res = await apiPost("/api/tenant/enrollments", { courseId, clientId });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setInfo("Learner enrolled.");
    router.refresh();
  }

  return (
    <Card className="mb-6">
      <h2 className="text-sm font-semibold uppercase text-stone-500">Onboard a learner</h2>
      <p className="mt-1 text-xs text-stone-500">
        Manually enroll a learner into any published course — including private and paid offerings.
      </p>
      <div className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-2">
        <FormField label="Course" htmlFor="me-course">
          <SelectInput
            id="me-course"
            placeholder="Select a course…"
            options={courses}
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          />
        </FormField>
        <FormField label="Learner" htmlFor="me-client">
          <SelectInput
            id="me-client"
            placeholder="Select a learner…"
            options={clients}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </FormField>
      </div>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {info ? <p className="mt-2 text-sm text-muted-foreground">{info}</p> : null}
      <div className="mt-3">
        <Button type="button" onClick={enroll} disabled={pending}>
          {pending ? "Enrolling…" : "Enroll"}
        </Button>
      </div>
    </Card>
  );
}
