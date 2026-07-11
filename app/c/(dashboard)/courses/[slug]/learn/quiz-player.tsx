"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/ui/toast";

type QType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
type Q = { id: string; type: QType; prompt: string; options: string[]; points: number };
type QuizPayload = {
  id: string;
  title: string;
  description: string | null;
  timeLimitMin: number | null;
  passingScore: number | null;
  questions: Q[];
};
type AnswerMap = Record<string, number[] | string>;

export function QuizPlayer({ quizId }: { quizId: string }) {
  const { toast, celebrate } = useToast();
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ scorePercent: number; passed: boolean | null } | null>(null);

  const load = useCallback(async () => {
    const res = await apiGet<{ quiz: QuizPayload }>(`/api/client/quizzes/${quizId}/attempt`);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setQuiz(res.data!.quiz);
  }, [quizId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader sets state only after await
    void load();
  }, [load]);

  function setChoice(qid: string, idx: number, multi: boolean) {
    setAnswers((prev) => {
      if (!multi) return { ...prev, [qid]: [idx] };
      const cur = Array.isArray(prev[qid]) ? (prev[qid] as number[]) : [];
      const next = cur.includes(idx) ? cur.filter((i) => i !== idx) : [...cur, idx];
      return { ...prev, [qid]: next };
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await apiPost<{ attempt: { scorePercent: number; passed: boolean | null } }>(
      `/api/client/quizzes/${quizId}/attempt`,
      { answers }
    );
    setSubmitting(false);
    if (res.error) {
      setError(res.error.message);
      toast(res.error.message);
      return;
    }
    const r = res.data!.attempt;
    setResult(r);
    if (r.passed === false) toast(`Scored ${r.scorePercent}%.`);
    else {
      celebrate();
      toast(`Scored ${r.scorePercent}%. 🎉`);
    }
  }

  if (error && !quiz) return <p className="text-sm font-bold text-red">{error}</p>;
  if (!quiz) return <Spinner label="Loading quiz…" />;

  if (result) {
    const passLabel =
      result.passed === null ? "Submitted" : result.passed ? "Passed" : "Not passed";
    return (
      <div className="rounded-[10px] border-2 border-ink bg-paper p-5 text-center">
        <div className="num font-heading text-4xl">{result.scorePercent}%</div>
        <div className="mt-2">
          <Badge>{passLabel}</Badge>
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => {
            setResult(null);
            setAnswers({});
          }}
        >
          Retake
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {quiz.description ? <p className="text-sm text-ink/70">{quiz.description}</p> : null}
      {quiz.questions.map((q, idx) => (
        <div key={q.id} className="rounded-[10px] border-2 border-ink bg-paper p-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-ink">
              {idx + 1}. {q.prompt}
            </p>
            <Badge>{q.points} pt</Badge>
          </div>
          {q.type === "SHORT_ANSWER" ? (
            <input
              type="text"
              value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
              placeholder="Your answer"
              className="w-full rounded-[10px] border-2 border-ink bg-card px-3 py-2 text-sm outline-none"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {(q.type === "TRUE_FALSE" ? ["True", "False"] : q.options).map((opt, i) => {
                const multi = q.type === "MULTIPLE_CHOICE";
                const selected = Array.isArray(answers[q.id]) && (answers[q.id] as number[]).includes(i);
                return (
                  <label key={i} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name={`q-${q.id}`}
                      checked={selected}
                      onChange={() => setChoice(q.id, i, multi)}
                      className="size-4"
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ))}
      {error ? <p className="text-sm font-bold text-red">{error}</p> : null}
      <div>
        <Button type="button" onClick={submit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit quiz"}
        </Button>
      </div>
    </div>
  );
}
