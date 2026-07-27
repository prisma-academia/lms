"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/ui/toast";
import { useApiError } from "@/components/use-api-error";
import type { QuestionTypeValue } from "@/lib/schemas/question";

type QType = QuestionTypeValue;
type Q = {
  id: string;
  type: QType;
  prompt: string;
  options: string[];
  points: number;
  /** ESSAY only: authored length guidance, shown so learners aren't guessing. */
  minWords?: number | null;
  maxWords?: number | null;
};
type QuizPayload = {
  id: string;
  title: string;
  description: string | null;
  timeLimitMin: number | null;
  passingScore: number | null;
  questions: Q[];
};
type AnswerMap = Record<string, number[] | string>;
type EssayFeedback = Record<
  string,
  { feedback: string; criteria: { id: string; label: string; score01: number; comment: string }[] }
>;
type AttemptResult = {
  id: string;
  scorePercent: number | null;
  passed: boolean | null;
  perfect: boolean;
  gradingStatus: "GRADED" | "PENDING";
  incorrectCount: number;
  essayFeedback: EssayFeedback;
};

export function QuizPlayer({
  quizId,
  onPerfect,
}: {
  quizId: string;
  /** Fires once the learner has a 100% attempt — this quiz's lesson can complete. */
  onPerfect?: () => void;
}) {
  const { toast, celebrate } = useToast();
  const report = useApiError();
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [clearedEarlier, setClearedEarlier] = useState(false);
  const [regrading, setRegrading] = useState(false);

  const hasEssays = quiz?.questions.some((q) => q.type === "ESSAY") ?? false;

  const load = useCallback(async () => {
    const res = await apiGet<{ quiz: QuizPayload; alreadyPerfect: boolean }>(
      `/api/client/quizzes/${quizId}/attempt`
    );
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setQuiz(res.data!.quiz);
    setClearedEarlier(res.data!.alreadyPerfect);
  }, [quizId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader sets state only after await
    void load();
  }, [load]);

  // A quiz cleared in an earlier session still unlocks its lesson.
  useEffect(() => {
    if (clearedEarlier) onPerfect?.();
  }, [clearedEarlier, onPerfect]);

  function setChoice(qid: string, idx: number, multi: boolean) {
    setAnswers((prev) => {
      if (!multi) return { ...prev, [qid]: [idx] };
      const cur = Array.isArray(prev[qid]) ? (prev[qid] as number[]) : [];
      const next = cur.includes(idx) ? cur.filter((i) => i !== idx) : [...cur, idx];
      return { ...prev, [qid]: next };
    });
  }

  type AttemptResponse = {
    attempt: Omit<AttemptResult, "incorrectCount" | "essayFeedback">;
    incorrectCount: number;
    essayFeedback: EssayFeedback;
  };

  function applyAttempt(data: AttemptResponse) {
    const r: AttemptResult = {
      ...data.attempt,
      incorrectCount: data.incorrectCount,
      essayFeedback: data.essayFeedback ?? {},
    };
    setResult(r);
    if (r.gradingStatus === "PENDING") {
      toast("Your written answers are still being graded. Your work is saved.");
      return;
    }
    if (r.perfect) {
      celebrate();
      toast("100%. Lesson unlocked 🎉");
      onPerfect?.();
    } else {
      toast(`Scored ${r.scorePercent}%. You need 100% to continue.`);
    }
  }

  async function submit() {
    setSubmitting(true);
    const res = await apiPost<AttemptResponse>(`/api/client/quizzes/${quizId}/attempt`, {
      answers,
    });
    setSubmitting(false);
    if (!report(res, () => submit())) return;
    applyAttempt(res.data!);
  }

  async function regrade(attemptId: string) {
    setRegrading(true);
    const res = await apiPost<AttemptResponse>(
      `/api/client/quizzes/${quizId}/attempts/${attemptId}/regrade`,
      {}
    );
    setRegrading(false);
    if (!report(res, () => regrade(attemptId))) return;
    applyAttempt(res.data!);
  }

  if (error && !quiz) return <p className="text-sm font-bold text-destructive">{error}</p>;
  if (!quiz) return <Spinner label="Loading quiz…" />;

  if (result) {
    // Grading failed. The answers are safely stored; the learner just needs the
    // grader back. Nothing is unlocked in this state, by design.
    if (result.gradingStatus === "PENDING") {
      return (
        <div className="rounded-[10px] border-2 border-border bg-muted p-5 text-center">
          <p className="font-heading text-lg">Still grading your written answers</p>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            Your work is saved — nothing has been lost. The automatic marker is unavailable
            right now. Try again in a moment, or come back later.
          </p>
          <Button
            type="button"
            className="mt-4"
            disabled={regrading}
            onClick={() => regrade(result.id)}
          >
            {regrading ? "Grading…" : "Grade my answers"}
          </Button>
        </div>
      );
    }

    const feedbackEntries = Object.entries(result.essayFeedback);

    return (
      <div className="rounded-[10px] border-2 border-border bg-muted p-5">
        <div className="text-center">
          <div className="num font-heading text-4xl">{result.scorePercent}%</div>
          <div className="mt-2">
            <Badge color={result.perfect ? "var(--success)" : "var(--warning)"}>
              {result.perfect ? "Passed" : "Not passed"}
            </Badge>
          </div>
          {/* Deliberately no per-question right/wrong map on a failed attempt:
              retries are unlimited and the bar is 100%, so it would just be an
              answer key handed over a few retakes at a time. Essay feedback
              below is different — it's formative, and it names gaps rather than
              answers. */}
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            {result.perfect
              ? "Every answer correct. You can mark this lesson complete."
              : `${result.incorrectCount} ${
                  result.incorrectCount === 1 ? "answer needs" : "answers need"
                } another look. Every question must be right to continue.`}
          </p>
        </div>

        {feedbackEntries.length > 0 ? (
          <div className="mt-5 flex flex-col gap-3 border-t-2 border-dashed border-border pt-4 text-left">
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Feedback on your written answers
            </p>
            {feedbackEntries.map(([qid, fb]) => {
              const index = quiz.questions.findIndex((q) => q.id === qid);
              return (
                <div key={qid} className="rounded-[10px] border-2 border-border bg-card p-3">
                  <p className="text-sm font-bold">Question {index >= 0 ? index + 1 : "—"}</p>
                  {fb.feedback ? (
                    <p className="mt-1 text-sm font-medium leading-relaxed">{fb.feedback}</p>
                  ) : null}
                  {fb.criteria.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {fb.criteria.map((c) => (
                        <li key={c.id} className="flex items-start gap-2 text-[13px]">
                          <span
                            className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                              c.score01 >= 1
                                ? "bg-success text-success-foreground"
                                : "bg-warning text-warning-foreground"
                            }`}
                          >
                            {Math.round(c.score01 * 100)}%
                          </span>
                          <span className="min-w-0">
                            <span className="font-bold">{c.label}</span>
                            {c.comment ? (
                              <span className="text-muted-foreground"> — {c.comment}</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="mt-4 text-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setResult(null);
              // Keep the learner's answers on a retry: retyping a five-paragraph
              // essay to fix one criterion would be its own punishment.
              if (result.perfect) setAnswers({});
            }}
          >
            {result.perfect ? "Review questions" : "Try again"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {quiz.description ? <p className="text-sm text-muted-foreground">{quiz.description}</p> : null}
      <p className="text-[13px] font-bold text-muted-foreground">
        {clearedEarlier
          ? "You've already scored 100% on this quiz."
          : "You need every answer correct (100%) to move on. Retakes are unlimited."}
      </p>
      {quiz.questions.map((q, idx) => (
        <div key={q.id} className="rounded-[10px] border-2 border-border bg-muted p-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-foreground">
              {idx + 1}. {q.prompt}
            </p>
            <Badge>{q.points} pt</Badge>
          </div>
          {q.type === "ESSAY" ? (
            (() => {
              const text = typeof answers[q.id] === "string" ? (answers[q.id] as string) : "";
              const words = text.trim() ? text.trim().split(/\s+/).length : 0;
              const under = q.minWords != null && words > 0 && words < q.minWords;
              const over = q.maxWords != null && words > q.maxWords;
              return (
                <div>
                  <textarea
                    value={text}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    rows={8}
                    placeholder="Write your answer…"
                    className="w-full rounded-[10px] border-2 border-border bg-card px-3 py-2 text-sm leading-relaxed outline-none"
                  />
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-bold text-muted-foreground">
                    <span className="num">{words} words</span>
                    {q.minWords != null ? <span>· min {q.minWords}</span> : null}
                    {q.maxWords != null ? <span>· max {q.maxWords}</span> : null}
                    {under ? <span className="text-warning">· a bit short</span> : null}
                    {over ? <span className="text-warning">· over the limit</span> : null}
                  </div>
                </div>
              );
            })()
          ) : q.type === "SHORT_ANSWER" ? (
            <input
              type="text"
              value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
              placeholder="Your answer"
              className="w-full rounded-[10px] border-2 border-border bg-card px-3 py-2 text-sm outline-none"
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
      <div>
        <Button type="button" onClick={submit} disabled={submitting}>
          {submitting ? (hasEssays ? "Grading your written answers…" : "Submitting…") : "Submit quiz"}
        </Button>
        {submitting && hasEssays ? (
          <p className="mt-1.5 text-[12px] font-bold text-muted-foreground">
            This can take up to a minute.
          </p>
        ) : null}
      </div>
    </div>
  );
}
