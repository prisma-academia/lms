"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { TextInput, TextArea } from "@/components/form-field";
import { useToast } from "@/components/ui/toast";

export function GradeForm({
  submissionId,
  learnerName,
  maxPoints,
  initialPoints,
  initialFeedback,
}: {
  submissionId: string;
  /** Names the form for assistive technology: a page holds one per submission. */
  learnerName: string;
  maxPoints: number;
  initialPoints: number | null;
  initialFeedback: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const uid = useId();
  const [points, setPoints] = useState(
    initialPoints != null ? String(initialPoints) : ""
  );
  const [feedback, setFeedback] = useState(initialFeedback ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(points);
    if (points.trim() === "" || Number.isNaN(n) || n < 0 || n > maxPoints) {
      setError(`Enter a mark between 0 and ${maxPoints}.`);
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
    toast(`Mark saved for ${learnerName}.`);
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={`Mark ${learnerName}'s submission`}
      className="mt-4 flex flex-col gap-3 border-t-2 border-dashed border-border pt-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor={`${uid}-points`} className="text-[13px] font-bold text-foreground">
            Mark
          </label>
          <div className="flex items-center gap-1.5">
            <TextInput
              id={`${uid}-points`}
              type="number"
              inputMode="numeric"
              min="0"
              max={maxPoints}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-24"
              aria-describedby={`${uid}-max`}
              required
            />
            <span id={`${uid}-max`} className="num text-sm font-bold text-muted-foreground">
              out of {maxPoints}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-feedback`} className="text-[13px] font-bold text-foreground">
          Feedback for the learner (optional)
        </label>
        <TextArea
          id={`${uid}-feedback`}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : initialPoints != null ? "Update mark" : "Save mark"}
        </Button>
      </div>
    </form>
  );
}
