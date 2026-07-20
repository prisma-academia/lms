"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, TextArea } from "@/components/form-field";

export function CreateQuizForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [passingScore, setPassingScore] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!title.trim()) return setError("Title is required.");
    setError(null);
    setPending(true);
    const res = await apiPost<{ quiz: { id: string } }>("/api/tenant/quizzes", {
      title: title.trim(),
      description: description.trim() || undefined,
      passingScore: passingScore.trim() ? parseInt(passingScore, 10) : null,
      timeLimitMin: timeLimit.trim() ? parseInt(timeLimit, 10) : null,
    });
    setPending(false);
    if (res.error) return setError(res.error.message);
    router.push(`/admin/quizzes/${res.data!.quiz.id}`);
  }

  return (
    <div className="grid max-w-xl gap-4">
      <FormField label="Title" htmlFor="q-title">
        <TextInput id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </FormField>
      <FormField label="Description (optional)" htmlFor="q-desc">
        <TextArea id="q-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Pass mark % (optional)" htmlFor="q-pass">
          <TextInput id="q-pass" type="number" min="0" max="100" value={passingScore} onChange={(e) => setPassingScore(e.target.value)} />
        </FormField>
        <FormField label="Time limit (min, optional)" htmlFor="q-time">
          <TextInput id="q-time" type="number" min="1" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
        </FormField>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Creating…" : "Create quiz"}
        </Button>
      </div>
    </div>
  );
}
