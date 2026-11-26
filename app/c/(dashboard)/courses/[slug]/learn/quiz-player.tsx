"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icon";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/ui/toast";
import { useApiError } from "@/components/use-api-error";
import type { QuestionTypeValue } from "@/lib/schemas/question";
import type { ReviewItem, ReviewSource } from "@/lib/assessments/review-links";

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
  /** Present only when the quiz allows hints and this question has one. */
  hint?: string | null;
};
type QuizPayload = {
  id: string;
  title: string;
  description: string | null;
  timeLimitMin: number | null;
  /** The mark this quiz is held to. An unset pass mark arrives as 100. */
  passMark: number;
  questions: Q[];
};
type GradingStatus = "GRADED" | "PENDING" | "FAILED";
type AnswerMap = Record<string, number[] | string>;
type EssayFeedback = Record<
  string,
  { feedback: string; criteria: { id: string; label: string; score01: number; comment: string }[] }
>;
type AttemptResult = {
  id: string;
  scorePercent: number | null;
  passed: boolean | null;
  passMark: number;
  perfect: boolean;
  gradingStatus: GradingStatus;
  incorrectCount: number;
  essayFeedback: EssayFeedback;
  /** On a failed attempt: the questions to look at again, and where to read up. */
  review: ReviewItem[] | null;
};

/**
 * What a learner has done in a quiz so far. Held by the page, not the player:
 * following a "read up" link swaps the quiz out for the lesson, and coming back
 * must find their answers and their result exactly where they left them.
 */
export type QuizSession = {
  /** The quiz as last loaded, so coming back shows it at once instead of a spinner. */
  quiz: QuizPayload | null;
  answers: AnswerMap;
  result: AttemptResult | null;
  hintsShown: string[];
};

export type QuizSessionStore = {
  read: (quizId: string) => QuizSession | undefined;
  write: (quizId: string, session: QuizSession) => void;
};

/** "100%" reads as a rule; "70%" reads as a threshold. Say each the natural way. */
function barText(passMark: number): string {
  return passMark >= 100 ? "every answer correct (100%)" : `${passMark}% or more`;
}

/** scroll-mt keeps the panel clear of the top of the viewport when it is scrolled to. */
const RESULT_PANEL =
  "scroll-mt-24 rounded-[10px] border-2 border-border bg-muted p-5 outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

function reviewLabel(source: ReviewSource): string {
  return source.heading ? `${source.lessonTitle} — ${source.heading}` : source.lessonTitle;
}

export function QuizPlayer({
  quizId,
  onPassed,
  sessions,
  onReview,
}: {
  quizId: string;
  /** Fires once the learner has a passing attempt — this quiz's lesson can complete. */
  onPassed?: () => void;
  /** Where this quiz's in-progress state is kept while the player is unmounted. */
  sessions?: QuizSessionStore;
  /** Open the lesson a question was drawn from. Without it, review links are not offered. */
  onReview?: (source: ReviewSource) => void;
}) {
  const { toast, celebrate } = useToast();
  const report = useApiError();
  // Shown straight away when the learner is coming back to this quiz; it is
  // still re-fetched below, so a quiz edited in the meantime catches up.
  const [quiz, setQuiz] = useState<QuizPayload | null>(() => sessions?.read(quizId)?.quiz ?? null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>(() => sessions?.read(quizId)?.answers ?? {});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(
    () => sessions?.read(quizId)?.result ?? null
  );
  const [hintsShown, setHintsShown] = useState<string[]>(
    () => sessions?.read(quizId)?.hintsShown ?? []
  );
  const [clearedEarlier, setClearedEarlier] = useState(false);
  const [regrading, setRegrading] = useState(false);

  // The result replaces a form that can be several screens long, so after a
  // submit the viewport is usually left looking at the middle of it. Bring the
  // result to the top and put focus on it, so the score is the first thing
  // seen and the first thing a screen reader says. Only after a grade arrives
  // in this visit; a result restored on coming back from a lesson is not news.
  const resultRef = useRef<HTMLDivElement>(null);
  const [gradedCount, setGradedCount] = useState(0);
  useEffect(() => {
    if (gradedCount === 0) return;
    const el = resultRef.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  }, [gradedCount]);

  const hasEssays = quiz?.questions.some((q) => q.type === "ESSAY") ?? false;

  // Hand every change up, so leaving the quiz to read a lesson loses nothing.
  useEffect(() => {
    sessions?.write(quizId, { quiz, answers, result, hintsShown });
  }, [sessions, quizId, quiz, answers, result, hintsShown]);

  const load = useCallback(async () => {
    const res = await apiGet<{
      quiz: QuizPayload;
      alreadyPassed: boolean;
      openAttempt: { id: string; gradingStatus: GradingStatus } | null;
    }>(`/api/client/quizzes/${quizId}/attempt`);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    const data = res.data!;
    setQuiz(data.quiz);
    setClearedEarlier(data.alreadyPassed);
    // An attempt still waiting on a grade survives a page refresh: without
    // this the learner would land back on a blank quiz with their essays
    // apparently gone, and no way to ask for the grade.
    if (data.openAttempt && !data.alreadyPassed) {
      setResult({
        id: data.openAttempt.id,
        scorePercent: null,
        passed: null,
        passMark: data.quiz.passMark,
        perfect: false,
        gradingStatus: data.openAttempt.gradingStatus,
        incorrectCount: 0,
        essayFeedback: {},
        review: null,
      });
    }
  }, [quizId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader sets state only after await
    void load();
  }, [load]);

  // A quiz passed in an earlier session still unlocks its lesson.
  useEffect(() => {
    if (clearedEarlier) onPassed?.();
  }, [clearedEarlier, onPassed]);

  function setChoice(qid: string, idx: number, multi: boolean) {
    setAnswers((prev) => {
      if (!multi) return { ...prev, [qid]: [idx] };
      const cur = Array.isArray(prev[qid]) ? (prev[qid] as number[]) : [];
      const next = cur.includes(idx) ? cur.filter((i) => i !== idx) : [...cur, idx];
      return { ...prev, [qid]: next };
    });
  }

  type AttemptResponse = {
    attempt: Omit<AttemptResult, "incorrectCount" | "essayFeedback" | "review">;
    incorrectCount: number;
    essayFeedback: EssayFeedback;
    review: ReviewItem[] | null;
  };

  function applyAttempt(data: AttemptResponse) {
    const r: AttemptResult = {
      ...data.attempt,
      incorrectCount: data.incorrectCount,
      essayFeedback: data.essayFeedback ?? {},
      review: data.review ?? null,
    };
    setResult(r);
    setGradedCount((n) => n + 1);
    if (r.gradingStatus === "PENDING") {
      toast("Your written answers are still being graded. Your work is saved.");
      return;
    }
    if (r.gradingStatus === "FAILED") {
      toast("Your written answers have been passed to your instructor to mark.");
      return;
    }
    if (r.passed) {
      celebrate();
      toast(`${r.scorePercent}%. Lesson unlocked 🎉`);
      onPassed?.();
    } else {
      toast(`Scored ${r.scorePercent}%. You need ${barText(r.passMark)} to continue.`);
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
        <div ref={resultRef} tabIndex={-1} role="region" aria-label="Quiz result" className={RESULT_PANEL + " text-center"}>
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

    // The automatic marker could not grade this, and retrying will not help.
    // Staff can mark it by hand; until they do there is nothing for the learner
    // to press, so say so plainly rather than offer a button that cannot work.
    if (result.gradingStatus === "FAILED") {
      return (
        <div ref={resultRef} tabIndex={-1} role="region" aria-label="Quiz result" className={RESULT_PANEL + " text-center"}>
          <p className="font-heading text-lg">With your instructor for marking</p>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            Your work is saved — nothing has been lost. Your written answers could not be marked
            automatically, so they have been passed to your instructor. This lesson will unlock
            once they have marked them; you don&rsquo;t need to do anything.
          </p>
        </div>
      );
    }

    const feedbackEntries = Object.entries(result.essayFeedback);
    const passed = result.passed === true;
    const review = !passed ? (result.review ?? []) : [];

    return (
      <div ref={resultRef} tabIndex={-1} role="region" aria-label="Quiz result" className={RESULT_PANEL}>
        <div className="text-center">
          <div className="num font-heading text-4xl">{result.scorePercent}%</div>
          <div className="mt-2">
            <Badge color={passed ? "var(--success)" : "var(--warning)"}>
              {passed ? "Passed" : "Not passed"}
            </Badge>
          </div>
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            {passed
              ? result.perfect
                ? "Every answer correct. You can mark this lesson complete."
                : `You passed — the pass mark is ${result.passMark}%. You can mark this lesson complete.`
              : `${result.incorrectCount} ${
                  result.incorrectCount === 1 ? "answer needs" : "answers need"
                } another look. You need ${barText(result.passMark)} to continue.`}
          </p>
        </div>

        {/* Which questions to look at again, and where each is taught. It names
            the question and never the answer: not the right option, and not
            which of the chosen options were wrong. Quizzes with review links
            switched off get the count above and nothing more. */}
        {review.length > 0 ? (
          <section
            aria-labelledby={`review-${quizId}`}
            className="mt-5 border-t-2 border-dashed border-border pt-4 text-left"
          >
            <h3
              id={`review-${quizId}`}
              className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground"
            >
              Questions to review
            </h3>
            <ol className="mt-2 flex flex-col gap-2">
              {review.map((item) => {
                const index = quiz.questions.findIndex((q) => q.id === item.questionId);
                const question = index >= 0 ? quiz.questions[index] : null;
                return (
                  <li
                    key={item.questionId}
                    className="rounded-[10px] border-2 border-border bg-card p-3"
                  >
                    <p className="text-sm font-bold">
                      {question ? `${index + 1}. ${question.prompt}` : "A question in this quiz"}
                    </p>
                    {item.source && onReview ? (
                      <button
                        type="button"
                        onClick={() => onReview(item.source!)}
                        className="mt-2 inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-[8px] text-left text-[13px] font-bold text-foreground underline decoration-2 underline-offset-4 outline-none [touch-action:manipulation] hover:decoration-primary focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <Icon name="book" className="size-4 shrink-0" aria-hidden />
                        <span className="min-w-0">
                          <span className="sr-only">Read up on this in </span>
                          <span aria-hidden>Read up: </span>
                          {reviewLabel(item.source)}
                        </span>
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 text-[12px] font-medium text-muted-foreground">
              Your answers are kept while you read — come back and try again when you&rsquo;re
              ready.
            </p>
          </section>
        ) : null}

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
              if (passed) setAnswers({});
            }}
          >
            {passed ? "Review questions" : "Try again"}
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
          ? "You've already passed this quiz."
          : `You need ${barText(quiz.passMark)} to move on. Retakes are unlimited.`}
      </p>
      {quiz.questions.map((q, idx) => {
        const hintOpen = hintsShown.includes(q.id);
        return (
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
                      aria-label={`Your answer to question ${idx + 1}`}
                      className="w-full rounded-[10px] border-2 border-border bg-card px-3 py-2 text-sm leading-relaxed outline-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring"
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
                aria-label={`Your answer to question ${idx + 1}`}
                className="w-full rounded-[10px] border-2 border-border bg-card px-3 py-2 text-sm outline-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
            ) : (
              <div className="flex flex-col gap-2">
                {(q.type === "TRUE_FALSE" ? ["True", "False"] : q.options).map((opt, i) => {
                  const multi = q.type === "MULTIPLE_CHOICE";
                  const selected = Array.isArray(answers[q.id]) && (answers[q.id] as number[]).includes(i);
                  return (
                    // The whole row is the target: an answer is chosen with a
                    // thumb, and a 16px box on its own is easy to miss.
                    <label
                      key={i}
                      className="-mx-2 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[8px] px-2 text-sm [touch-action:manipulation] hover:bg-card has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring"
                    >
                      <input
                        type={multi ? "checkbox" : "radio"}
                        name={`q-${q.id}`}
                        checked={selected}
                        onChange={() => setChoice(q.id, i, multi)}
                        className="size-5 shrink-0 accent-[var(--primary)]"
                      />
                      {opt}
                    </label>
                  );
                })}
              </div>
            )}

            {/* A hint is the learner's choice: it stays hidden until asked for.
                The live region is always in the page so a screen reader hears
                the hint when it appears, without focus being moved. */}
            {q.hint ? (
              <div className="mt-3">
                {hintOpen ? null : (
                  <button
                    type="button"
                    onClick={() => setHintsShown((prev) => [...prev, q.id])}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] text-[13px] font-bold text-muted-foreground underline decoration-2 underline-offset-4 outline-none [touch-action:manipulation] hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Show a hint
                    <span className="sr-only"> for question {idx + 1}</span>
                  </button>
                )}
                <div aria-live="polite">
                  {hintOpen ? (
                    <p className="rounded-[8px] border-2 border-dashed border-border bg-card px-3 py-2 text-[13px] font-medium leading-relaxed text-card-foreground">
                      <span className="font-bold">Hint: </span>
                      {q.hint}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
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
