"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ESSAY_LEVELS, ESSAY_LEVEL_SCORE, type EssayLevel } from "@/lib/schemas/essay-grading";

export type AttemptCriterion = {
  id: string;
  label: string;
  score01: number;
  comment: string;
};

export type AttemptQuestion = {
  questionId: string;
  prompt: string;
  type: string;
  answer: string;
  earned: number;
  points: number;
  correct: boolean;
  feedback: string | null;
  criteria: AttemptCriterion[];
};

export type AttemptRow = {
  id: string;
  learner: string;
  /**
   * When it was submitted, already formatted on the server. This component
   * renders on the server and again in the browser; formatting a date here
   * would do it twice, in two locales, and the two results would not match.
   */
  submittedLabel: string;
  scorePercent: number | null;
  passed: boolean;
  gradingStatus: "GRADED" | "PENDING" | "FAILED";
  gradingError: string | null;
  /** True when a member of staff, not the AI grader, set the essay marks. */
  markedByStaff: boolean;
  questions: AttemptQuestion[];
};

const LEVEL_LABEL: Record<EssayLevel, string> = {
  none: "Not met",
  partial: "Partly met",
  mostly: "Mostly met",
  full: "Fully met",
};

/** The level whose credit is closest to a stored score — for pre-filling the form. */
function levelFor(score01: number): EssayLevel {
  return ESSAY_LEVELS.reduce((best, level) =>
    Math.abs(ESSAY_LEVEL_SCORE[level] - score01) < Math.abs(ESSAY_LEVEL_SCORE[best] - score01) ? level : best
  );
}

const STATUS_LABEL: Record<AttemptRow["gradingStatus"], string> = {
  GRADED: "Graded",
  PENDING: "Awaiting grade",
  FAILED: "Needs marking",
};

type Marks = Record<string, { levels: Record<string, EssayLevel | "">; feedback: string }>;

/**
 * Mark one attempt's written answers by hand.
 *
 * Starts from whatever marks already exist, so correcting one criterion the AI
 * got wrong does not mean re-entering all the others. An attempt the AI never
 * graded starts blank: every criterion has to be an actual decision.
 */
function MarkingForm({
  quizId,
  attempt,
  onDone,
}: {
  quizId: string;
  attempt: AttemptRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const written = attempt.questions.filter((q) => q.type === "ESSAY");
  const graded = attempt.gradingStatus === "GRADED";

  const [marks, setMarks] = useState<Marks>(() =>
    Object.fromEntries(
      written.map((q) => [
        q.questionId,
        {
          levels: Object.fromEntries(q.criteria.map((c) => [c.id, graded ? levelFor(c.score01) : ""])),
          feedback: graded ? (q.feedback ?? "") : "",
        },
      ])
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = written.every((q) => q.criteria.every((c) => marks[q.questionId]?.levels[c.id]));

  async function save() {
    setSaving(true);
    setError(null);
    const res = await apiPost<{ scorePercent: number; passed: boolean }>(
      `/api/tenant/quizzes/${quizId}/attempts/${attempt.id}/grade`,
      {
        grades: Object.fromEntries(
          written.map((q) => [
            q.questionId,
            {
              criteria: q.criteria.map((c) => ({ id: c.id, level: marks[q.questionId].levels[c.id] })),
              feedback: marks[q.questionId].feedback.trim() || undefined,
            },
          ])
        ),
      }
    );
    setSaving(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast(`Marked — ${res.data!.scorePercent}%, ${res.data!.passed ? "passed" : "not passed"}.`);
    onDone();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {written.map((q) => (
        <fieldset key={q.questionId} className="rounded-[10px] border-2 border-border bg-card p-3">
          <legend className="px-1 text-[13px] font-bold">{q.prompt}</legend>
          <p className="whitespace-pre-wrap rounded-[8px] border-2 border-border bg-muted px-2 py-1.5 text-[13px] leading-relaxed">
            {q.answer || "(no answer submitted)"}
          </p>

          <div className="mt-3 flex flex-col gap-2.5">
            {q.criteria.map((c) => {
              const fieldId = `mark-${attempt.id}-${q.questionId}-${c.id}`;
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <label htmlFor={fieldId} className="min-w-0 flex-1 basis-56 text-[13px] font-medium">
                    {c.label}
                  </label>
                  <select
                    id={fieldId}
                    value={marks[q.questionId]?.levels[c.id] ?? ""}
                    onChange={(e) =>
                      setMarks((prev) => ({
                        ...prev,
                        [q.questionId]: {
                          ...prev[q.questionId],
                          levels: {
                            ...prev[q.questionId].levels,
                            [c.id]: e.target.value as EssayLevel | "",
                          },
                        },
                      }))
                    }
                    className="rounded-[8px] border-2 border-border bg-card px-2 py-1.5 text-[13px] font-medium"
                  >
                    <option value="">Choose a mark…</option>
                    {ESSAY_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {LEVEL_LABEL[level]} ({Math.round(ESSAY_LEVEL_SCORE[level] * 100)}%)
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <label
            htmlFor={`fb-${attempt.id}-${q.questionId}`}
            className="mt-3 block text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
          >
            Feedback to the learner (optional)
          </label>
          <textarea
            id={`fb-${attempt.id}-${q.questionId}`}
            rows={3}
            maxLength={1500}
            value={marks[q.questionId]?.feedback ?? ""}
            onChange={(e) =>
              setMarks((prev) => ({
                ...prev,
                [q.questionId]: { ...prev[q.questionId], feedback: e.target.value },
              }))
            }
            className="mt-1 w-full rounded-[8px] border-2 border-border bg-card px-2 py-1.5 text-[13px] leading-relaxed"
          />
        </fieldset>
      ))}

      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={save} disabled={saving || !complete}>
          {saving ? "Saving…" : "Save marks"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        {!complete ? (
          <span className="text-[12px] font-medium text-muted-foreground">
            Choose a mark for every criterion to save.
          </span>
        ) : null}
      </div>
    </div>
  );
}

function AttemptItem({
  quizId,
  attempt,
  canGrade,
}: {
  quizId: string;
  attempt: AttemptRow;
  canGrade: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const written = attempt.questions.filter((q) => q.type === "ESSAY");
  const waiting = attempt.gradingStatus !== "GRADED";
  const [marking, setMarking] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function retryAi() {
    setRetrying(true);
    setRetryError(null);
    const res = await apiPost<{ scorePercent: number; passed: boolean }>(
      `/api/tenant/quizzes/${quizId}/attempts/${attempt.id}/grade`,
      { action: "retry_ai" }
    );
    setRetrying(false);
    if (res.error) {
      setRetryError(res.error.message);
      router.refresh();
      return;
    }
    toast(`Graded — ${res.data!.scorePercent}%.`);
    router.refresh();
  }

  return (
    <li className="rounded-[10px] border-2 border-border bg-card">
      {/* Attempts that need someone to act open by default: that is the reason
          to be looking at this list at all. */}
      <details open={waiting}>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1 truncate font-semibold">{attempt.learner}</span>
          {attempt.gradingStatus === "GRADED" ? (
            <Badge color={attempt.passed ? "var(--success)" : "var(--warning)"}>
              {attempt.scorePercent}% · {attempt.passed ? "Passed" : "Not passed"}
            </Badge>
          ) : (
            <Badge color="var(--destructive)">{STATUS_LABEL[attempt.gradingStatus]}</Badge>
          )}
          {attempt.markedByStaff ? <Badge>Marked by staff</Badge> : null}
          <span className="num text-xs text-muted-foreground">{attempt.submittedLabel}</span>
        </summary>

        <div className="border-t-2 border-dashed border-border px-3 py-3">
          {waiting ? (
            <div className="mb-3 rounded-[8px] border-2 border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px]">
              <p className="font-bold text-foreground">
                {attempt.gradingStatus === "FAILED"
                  ? "The AI grader could not mark this attempt. The learner is waiting on you."
                  : "The AI grader has not marked this attempt yet."}
              </p>
              <p className="mt-0.5 font-medium text-muted-foreground">
                The learner cannot continue the course until it is marked.
              </p>
              {attempt.gradingError ? (
                <p className="mt-1.5 break-words font-mono text-[11.5px] text-muted-foreground">
                  {attempt.gradingError}
                </p>
              ) : null}
            </div>
          ) : null}

          {written.length === 0 ? (
            <p className="text-xs text-muted-foreground">No written answers on this attempt.</p>
          ) : marking ? (
            <MarkingForm quizId={quizId} attempt={attempt} onDone={() => setMarking(false)} />
          ) : (
            <>
              {/* An ungraded attempt has nothing to review yet — only answers. */}
              <div className="flex flex-col gap-3">
                {written.map((q) => (
                  <div key={q.questionId}>
                    <p className="text-[13px] font-bold">{q.prompt}</p>
                    <p className="mt-1 whitespace-pre-wrap rounded-[8px] border-2 border-border bg-muted px-2 py-1.5 text-[13px] leading-relaxed">
                      {q.answer || "(no answer submitted)"}
                    </p>
                    {waiting ? null : (
                      <>
                        <p className="num mt-1 text-xs font-bold text-muted-foreground">
                          {q.earned} / {q.points} pts
                        </p>
                        {q.feedback ? (
                          <p className="mt-1 text-[13px] italic text-muted-foreground">{q.feedback}</p>
                        ) : null}
                        {q.criteria.length > 0 ? (
                          <ul className="mt-1.5 flex flex-col gap-1">
                            {q.criteria.map((c) => (
                              <li key={c.id} className="flex items-start gap-2 text-[12.5px]">
                                <span className="num shrink-0 font-bold">
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
                      </>
                    )}
                  </div>
                ))}
              </div>

              {canGrade ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={waiting ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMarking(true)}
                    disabled={retrying}
                  >
                    {waiting ? "Mark by hand" : "Change marks"}
                  </Button>
                  {waiting ? (
                    <Button type="button" variant="outline" size="sm" onClick={retryAi} disabled={retrying}>
                      {retrying ? "Asking the AI grader…" : "Try the AI grader again"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {retryError ? (
                <p role="alert" className="mt-2 text-[13px] font-bold text-destructive">
                  {retryError}
                </p>
              ) : null}
            </>
          )}
        </div>
      </details>
    </li>
  );
}

/**
 * Learner attempts, with the grader's per-criterion reasoning — and the means
 * to act on it.
 *
 * Essay grades are assigned by a model and then gate a learner's progress. An
 * instructor has to be able to see what the grader said, overrule it, and mark
 * an attempt themselves when the grader could not: otherwise a model outage is
 * a learner locked out of a course with nobody able to let them in.
 */
export function AttemptsPanel({
  quizId,
  attempts,
  canGrade,
  passMark,
}: {
  quizId: string;
  attempts: AttemptRow[];
  canGrade: boolean;
  passMark: number;
}) {
  const waiting = attempts.filter((a) => a.gradingStatus !== "GRADED");
  // Whatever needs marking comes first; the rest stay newest-first.
  const ordered = [...waiting, ...attempts.filter((a) => a.gradingStatus === "GRADED")];

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          Recent attempts ({attempts.length})
        </h2>
        <p className="text-xs font-medium text-muted-foreground">
          Pass mark {passMark}%
          {waiting.length > 0 ? (
            <span className="ml-2 font-bold text-destructive">
              {waiting.length} waiting to be marked
            </span>
          ) : null}
        </p>
      </div>
      {attempts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No one has taken this quiz yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {ordered.map((a) => (
            <AttemptItem key={a.id} quizId={quizId} attempt={a} canGrade={canGrade} />
          ))}
        </ul>
      )}
    </Card>
  );
}
