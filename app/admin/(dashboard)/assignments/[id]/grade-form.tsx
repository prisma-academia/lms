"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { TextInput, TextArea } from "@/components/form-field";

export function GradeForm({
  submissionId,
  maxPoints,
  initialPoints,
  initialFeedback,
}: {
  submissionId: string;
  maxPoints: number;
  initialPoints: number | null;
  initialFeedback: string | null;
}) {
  const router = useRouter();
  const [points, setPoints] = useState(
    initialPoints != null ? String(initialPoints) : ""
  );
  const [feedback, setFeedback] = useState(initialFeedback ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const n = Number(points);
    if (Number.isNaN(n) || n < 0 || n > maxPoints) {
      setError(`Enter points between 0 and ${maxPoints}.`);
      return;
    }
    setPending(true);
    const res = await apiPost(`/api/tenant/submissions/${submissionId}/grade`, {
      points: n,
      feedback: feedback.trim() || null,
    });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[13px] font-bold text-foreground">Points</span>
          <div className="flex items-center gap-1.5">
            <TextInput
              type="number"
              min="0"
              max={maxPoints}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-24"
              required
            />
            <span className="num text-sm font-bold text-muted-foreground">/ {maxPoints}</span>
          </div>
        </label>
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : initialPoints != null ? "Update grade" : "Save grade"}
        </Button>
        {saved ? (
          <span className="pb-2 text-sm font-bold text-success">Saved ✓</span>
        ) : null}
      </div>
      <TextArea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Feedback (optional)"
        rows={2}
      />
      {error ? <p className="text-xs font-bold text-destructive">{error}</p> : null}
    </form>
  );
}
