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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Give the quiz a title.");
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
    <form onSubmit={submit} className="grid max-w-xl gap-4">
      <FormField label="Title" htmlFor="q-title">
        <TextInput
          id="q-title"
          name="title"
          autoComplete="off"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </FormField>
      <FormField label="Description (optional)" htmlFor="q-desc" hint="Shown to learners above the first question.">
        <TextArea id="q-desc" name="description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Pass mark (%)"
          htmlFor="q-pass"
          hint="The score a learner needs to move on. Leave empty to require every answer correct (100%)."
        >
          <TextInput
            id="q-pass"
            name="passingScore"
            type="number"
            inputMode="numeric"
            min="0"
            max="100"
            placeholder="100"
            value={passingScore}
            onChange={(e) => setPassingScore(e.target.value)}
          />
        </FormField>
        <FormField label="Time limit in minutes (optional)" htmlFor="q-time">
          <TextInput
            id="q-time"
            name="timeLimitMin"
            type="number"
            inputMode="numeric"
            min="1"
            value={timeLimit}
            onChange={(e) => setTimeLimit(e.target.value)}
          />
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create quiz"}
        </Button>
      </div>
    </form>
  );
}
