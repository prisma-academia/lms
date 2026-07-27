import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";

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
  submittedAt: string | null;
  scorePercent: number | null;
  gradingStatus: "GRADED" | "PENDING" | "FAILED";
  gradingError: string | null;
  questions: AttemptQuestion[];
};

/**
 * Read-only review of learner attempts, with the AI's per-criterion reasoning.
 *
 * This exists because essay grades are assigned by a model and then gate a
 * learner's progress. Shipping that with no way for an instructor to see what
 * the grader actually said — or to notice that it has been marking everyone
 * down on criterion 3 — would not be defensible.
 */
export function AttemptsPanel({ attempts }: { attempts: AttemptRow[] }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase text-stone-500">
        Recent attempts ({attempts.length})
      </h2>
      {attempts.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600">No one has taken this quiz yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {attempts.map((a) => {
            const written = a.questions.filter((q) => q.type === "ESSAY");
            return (
              <li key={a.id} className="rounded-[10px] border-2 border-border bg-card">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate font-semibold">{a.learner}</span>
                    {a.gradingStatus === "GRADED" ? (
                      <Badge color={a.scorePercent === 100 ? "var(--success)" : "var(--warning)"}>
                        {a.scorePercent}%
                      </Badge>
                    ) : (
                      <Badge color="var(--destructive)">{a.gradingStatus}</Badge>
                    )}
                    <span className="num text-xs text-muted-foreground">
                      {a.submittedAt ? new Date(a.submittedAt).toLocaleString() : "—"}
                    </span>
                  </summary>

                  <div className="border-t-2 border-dashed border-border px-3 py-3">
                    {a.gradingError ? (
                      <p className="mb-3 rounded-[8px] border-2 border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs font-bold text-destructive">
                        Grading error: {a.gradingError}
                      </p>
                    ) : null}

                    {written.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No written answers on this attempt.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {written.map((q) => (
                          <div key={q.questionId}>
                            <p className="text-[13px] font-bold">{q.prompt}</p>
                            <p className="mt-1 whitespace-pre-wrap rounded-[8px] border-2 border-border bg-muted px-2 py-1.5 text-[13px] leading-relaxed">
                              {q.answer || "(no answer submitted)"}
                            </p>
                            <p className="num mt-1 text-xs font-bold text-muted-foreground">
                              {q.earned} / {q.points} pts
                            </p>
                            {q.feedback ? (
                              <p className="mt-1 text-[13px] italic text-muted-foreground">
                                {q.feedback}
                              </p>
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
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
