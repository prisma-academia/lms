"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client/api";
import { Icon } from "@/components/icon";

type State = {
  exam: { title: string; durationMin: number; passMark: number; attemptsAllowed: number; closesAt: string | null };
  window: string;
  attemptsUsed: number;
  openAttemptId: string | null;
  canStart: boolean;
  past: { id: string; released: boolean; scorePercent: number | null; passed: boolean | null; grade: string | null }[];
};

/**
 * An EXAM lesson inside a course. The exam itself never runs inline — it
 * opens in its own locked window from the lobby. This card shows where the
 * learner stands and unlocks the lesson once a passing result is released.
 */
export function ExamLessonCard({ examId, onPassed }: { examId: string; onPassed?: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const res = await apiGet<State>(`/api/exam/${examId}/state`);
      if (stop) return;
      if (res.data && "exam" in res.data) {
        setState(res.data);
        if (res.data.past.some((p) => p.released && p.passed)) onPassed?.();
      } else setError(res.error?.message ?? "This exam is not available yet.");
    };
    void load();
    // Results can be released while the learner is on the page.
    const t = setInterval(load, 30_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [examId, onPassed]);

  if (error) return <p className="text-sm font-bold text-muted-foreground">{error}</p>;
  if (!state) return <p className="text-sm font-bold text-muted-foreground">Loading the exam…</p>;
  const best = state.past.filter((p) => p.released).sort((a, b) => (b.scorePercent ?? 0) - (a.scorePercent ?? 0))[0];
  const pending = state.past.some((p) => !p.released);

  return (
    <div className="flex flex-col gap-4 rounded-[14px] border-2 border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-[12px] border-2 border-border bg-primary text-primary-foreground">
          <Icon name="monitor" className="size-6" />
        </span>
        <div>
          <h3 className="font-heading text-lg font-black">{state.exam.title}</h3>
          <p className="text-sm font-medium text-muted-foreground">
            Computer-based exam · {state.exam.durationMin} minutes · pass mark {state.exam.passMark}% · {state.attemptsUsed} of {state.exam.attemptsAllowed} attempts used
          </p>
        </div>
      </div>
      {best ? (
        <p className="text-sm font-black">
          Your best result: {best.scorePercent != null ? `${Math.round(best.scorePercent)}%` : "—"}
          {best.grade ? ` (${best.grade})` : ""} — {best.passed ? "passed ✓" : "not yet passed"}
        </p>
      ) : pending ? (
        <p className="text-sm font-bold text-muted-foreground">Your result has not been released yet.</p>
      ) : null}
      {state.canStart ? (
        <a
          href={`/exam/${examId}`}
          className="inline-flex min-h-12 w-fit items-center gap-2 rounded-[10px] border-2 border-border bg-primary px-5 font-black text-primary-foreground"
        >
          {state.openAttemptId ? "Resume the exam" : "Go to the exam"} <Icon name="arrow-right" className="size-4" />
        </a>
      ) : (
        <p className="text-sm font-bold text-muted-foreground">
          {state.window === "upcoming" ? "This exam has not opened yet." : state.window === "closed" ? "This exam has closed." : "No attempts left."}
        </p>
      )}
      <p className="text-xs font-medium text-muted-foreground">The exam opens in its own fullscreen window. This lesson completes when a passing result is released.</p>
    </div>
  );
}
