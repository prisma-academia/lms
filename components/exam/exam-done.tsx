"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/client/api";
import { Icon } from "@/components/icon";
import { MathText } from "@/components/assessments/math-text";
import { QuestionPlayer } from "@/components/assessments/question-player";
import type { QuestionTypeValue } from "@/lib/schemas/question";
import { cn } from "@/lib/utils";

type Result = {
  exam: { title: string };
  candidate: { fullName: string; candidateNo: string };
  status: string;
  submittedAt: string | null;
  submitReason: string | null;
  answeredCount: number;
  released: boolean;
  releaseMode: string;
  score: null | {
    scorePoints: number | null;
    maxPoints: number | null;
    scorePercent: number | null;
    passed: boolean | null;
    passMark: number;
    grade: string | null;
    sections: { title: string; earned: number; max: number }[];
  };
  review:
    | null
    | {
        key: string;
        n: number;
        type: QuestionTypeValue;
        prompt: string;
        view: unknown;
        media: null;
        answer: unknown;
        earned: number;
        max: number;
        outcome: "correct" | "partial" | "incorrect" | "unanswered";
        feedback: string | null;
        correct: string | null;
        explanation: string | null;
      }[];
};

const REASON: Record<string, string> = {
  MANUAL: "You submitted the exam.",
  TIME_UP: "Time ran out and your answers were submitted automatically.",
  MAX_VIOLATIONS: "The exam was submitted automatically after repeated warnings.",
  PROCTOR: "The invigilator ended your exam.",
  WINDOW_CLOSED: "The exam closed and your answers were submitted automatically.",
};

/** The receipt, and the result once the examiners release it. */
export function ExamDone({ examId, attemptId, quit, pinSession }: { examId: string; attemptId: string | null; quit: boolean; pinSession: boolean }) {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The exam is over on this device: drop its offline copy.
    void navigator.serviceWorker?.getRegistration("/exam/").then((r) => r?.active?.postMessage({ type: "clear" }));
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    if (!attemptId) return;
    void apiGet<Result>(`/api/exam/attempts/${attemptId}/result`).then((res) => (res.data ? setData(res.data) : setError(res.error?.message ?? "Could not load the result.")));
  }, [attemptId]);

  if (quit) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <p className="text-lg font-black">You can close Safe Exam Browser now.</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl rounded-[18px] border-2 border-border bg-card p-6 shadow-[6px_6px_0_0_var(--border)]">
        <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full border-2 border-border bg-[var(--success)] text-white">
          <Icon name="check" className="size-8" />
        </div>
        <h1 className="text-center font-heading text-2xl font-black">Exam submitted</h1>
        {data ? (
          <>
            <p className="mt-1 text-center text-[15px] font-medium text-muted-foreground">{REASON[data.submitReason ?? "MANUAL"] ?? ""}</p>
            <div className="mx-auto mt-5 max-w-md rounded-[12px] border-2 border-dashed border-border bg-background p-4 text-sm">
              <div className="text-xs font-black uppercase text-muted-foreground">Submission receipt</div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="font-bold text-muted-foreground">Exam</dt>
                <dd className="font-black">{data.exam.title}</dd>
                <dt className="font-bold text-muted-foreground">Candidate</dt>
                <dd className="font-black">
                  {data.candidate.fullName} · <span className="num font-mono">{data.candidate.candidateNo}</span>
                </dd>
                <dt className="font-bold text-muted-foreground">Submitted</dt>
                <dd className="font-black">{data.submittedAt ? new Date(data.submittedAt).toLocaleString() : "—"}</dd>
                <dt className="font-bold text-muted-foreground">Answered</dt>
                <dd className="num font-black">{data.answeredCount}</dd>
                <dt className="font-bold text-muted-foreground">Reference</dt>
                <dd className="num font-mono font-black">{attemptId?.slice(-10).toUpperCase()}</dd>
              </dl>
            </div>

            {data.score ? (
              <section className="mt-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Big label="Score" value={data.score.scorePercent != null ? `${Math.round(data.score.scorePercent)}%` : "—"} sub={`${data.score.scorePoints ?? 0} / ${data.score.maxPoints ?? 0} marks`} />
                  <Big label="Grade" value={data.score.grade ?? "—"} />
                  <Big
                    label="Result"
                    value={data.score.passed ? "Pass" : "Not yet"}
                    sub={`Pass mark ${data.score.passMark}%`}
                    tone={data.score.passed ? "ok" : "bad"}
                  />
                </div>
                {data.score.sections.length > 1 ? (
                  <ul className="mt-4 flex flex-col gap-2">
                    {data.score.sections.map((s) => (
                      <li key={s.title} className="flex items-center gap-3 text-sm">
                        <span className="w-40 truncate font-bold">{s.title}</span>
                        <span className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full bg-primary" style={{ width: `${s.max ? Math.max(0, (s.earned / s.max) * 100) : 0}%` }} />
                        </span>
                        <span className="num w-20 text-right font-black">
                          {s.earned} / {s.max}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : (
              <p className="mt-6 text-center text-sm font-bold text-muted-foreground">
                {data.released ? "This exam does not show scores." : data.releaseMode === "IMMEDIATE" ? "Your result is being marked. Check back shortly." : "Your result will appear here once the examiners release it."}
              </p>
            )}

            {data.review ? (
              <section className="mt-8 flex flex-col gap-4">
                <h2 className="font-heading text-xl font-black">Your answers</h2>
                {data.review.map((r) => (
                  <article key={r.key} className="rounded-[12px] border-2 border-border bg-background p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase text-muted-foreground">Question {r.n}</span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-black",
                          r.outcome === "correct" ? "bg-[var(--success)] text-white" : r.outcome === "partial" ? "bg-[var(--warning)] text-black" : r.outcome === "incorrect" ? "bg-destructive text-white" : "bg-muted"
                        )}
                      >
                        {r.outcome === "unanswered" ? "Not answered" : r.outcome} · {r.earned} / {r.max}
                      </span>
                    </div>
                    <QuestionPlayer question={{ id: r.key, type: r.type, prompt: r.prompt, view: r.view, media: r.media }} value={r.answer} onChange={() => undefined} disabled />
                    {r.correct ? (
                      <p className="mt-3 text-sm">
                        <span className="font-black">Correct answer: </span>
                        <MathText>{r.correct}</MathText>
                      </p>
                    ) : null}
                    {r.explanation ? <MathText as="p" className="mt-1 text-sm text-muted-foreground">{r.explanation}</MathText> : null}
                    {r.feedback ? <p className="mt-2 rounded-[8px] bg-muted p-2 text-sm"><span className="font-black">Marker: </span>{r.feedback}</p> : null}
                  </article>
                ))}
              </section>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-center text-sm font-medium text-muted-foreground">{error ?? (attemptId ? "Loading…" : "Your answers have been received.")}</p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <a href={`/exam/${examId}/done?quit=1`} className="inline-flex min-h-11 items-center rounded-[10px] border-2 border-border bg-card px-5 font-black">
            Finish
          </a>
          {pinSession ? (
            <button
              type="button"
              onClick={async () => {
                await apiPost("/api/exam/logout", {});
                location.assign("/exam");
              }}
              className="inline-flex min-h-11 items-center rounded-[10px] border-2 border-border bg-primary px-5 font-black text-primary-foreground"
            >
              Sign out
            </button>
          ) : (
            <a href="/my-exams" className="inline-flex min-h-11 items-center rounded-[10px] border-2 border-border bg-primary px-5 font-black text-primary-foreground">
              Back to My exams
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Big({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "bad" }) {
  return (
    <div className={cn("rounded-[12px] border-2 p-4 text-center", tone === "ok" ? "border-[var(--success)]" : tone === "bad" ? "border-destructive" : "border-border")}>
      <div className="text-xs font-black uppercase text-muted-foreground">{label}</div>
      <div className="num text-3xl font-black">{value}</div>
      {sub ? <div className="text-xs font-bold text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
