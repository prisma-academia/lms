"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiGet } from "@/lib/client/api";
import type { AttemptReview, ItemVerdict, ReviewItem } from "@/lib/exams/review";
import { ATTEMPT_STATUS_COLOR, ATTEMPT_STATUS_LABEL, SUBMIT_REASON_LABEL } from "@/lib/exams/event-labels";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QuestionPlayer, type Media } from "@/components/assessments/question-player";
import { MathText } from "@/components/assessments/math-text";
import { Icon } from "@/components/icon";
import { EventTimeline } from "@/components/exam-ops/timeline";
import { ACTION_LABEL, actionsFor, useProctorControls } from "@/components/exam-ops/proctor-controls";
import { clock, num, pct, seconds, when, type Fmt } from "@/components/exam-ops/format";
import { cn } from "@/lib/utils";

const VERDICT: Record<ItemVerdict, { label: string; color: string; icon: "check" | "x" | "alert-triangle" | "clock" | "eye-off" | "trash" }> = {
  correct: { label: "Correct", color: "var(--success)", icon: "check" },
  incorrect: { label: "Incorrect", color: "var(--destructive)", icon: "x" },
  partial: { label: "Partly correct", color: "var(--warning)", icon: "alert-triangle" },
  needs_marking: { label: "Needs marking", color: "var(--info)", icon: "clock" },
  unanswered: { label: "Not answered", color: "var(--muted)", icon: "eye-off" },
  removed: { label: "Removed", color: "var(--muted)", icon: "trash" },
};

const noop = () => {};

export function AttemptReviewView({
  examId,
  attemptId,
  fmt,
  canProctor,
  canGrade,
}: {
  examId: string;
  attemptId: string;
  fmt: Fmt;
  canProctor: boolean;
  canGrade: boolean;
}) {
  const [data, setData] = useState<AttemptReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<"all" | "wrong" | "marking" | "flagged">("all");

  useEffect(() => {
    let live = true;
    void apiGet<AttemptReview>(`/api/tenant/exams/${examId}/attempts/${attemptId}`).then((res) => {
      if (!live) return;
      if (res.data) {
        setData(res.data);
        setError(null);
      } else setError(res.error?.message ?? "Could not load the attempt.");
    });
    return () => {
      live = false;
    };
  }, [examId, attemptId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const controls = useProctorControls(examId, reload);

  if (!data) {
    if (error) {
      return (
        <Card>
          <p role="alert" className="text-sm font-bold text-destructive">
            {error}
          </p>
          <Button className="mt-3" variant="outline" onClick={reload}>
            Try again
          </Button>
        </Card>
      );
    }
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-5">
        <span className="sr-only">Loading the attempt…</span>
        <Skeleton className="h-48" />
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const { attempt, candidate } = data;
  const items = data.sections.flatMap((s) => s.items);
  const counts = {
    correct: items.filter((i) => i.verdict === "correct").length,
    partial: items.filter((i) => i.verdict === "partial").length,
    incorrect: items.filter((i) => i.verdict === "incorrect").length,
    unanswered: items.filter((i) => i.verdict === "unanswered").length,
    marking: items.filter((i) => i.verdict === "needs_marking").length,
  };
  const actions = canProctor ? actionsFor(attempt.status, false) : [];
  const show = (i: ReviewItem) =>
    filter === "all" ||
    (filter === "wrong" && (i.verdict === "incorrect" || i.verdict === "partial" || i.verdict === "unanswered")) ||
    (filter === "marking" && i.verdict === "needs_marking") ||
    (filter === "flagged" && !!i.response?.flagged);
  const minutes = attempt.submittedAt ? (new Date(attempt.submittedAt).getTime() - new Date(attempt.startedAt).getTime()) / 60000 : null;

  return (
    <div className="flex flex-col gap-6">
      {controls.dialogs}

      {/* Header */}
      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-sm font-bold">{candidate.candidateNo}</p>
            <p className="text-[13px] font-medium text-muted-foreground">
              {[candidate.regNumber && `Reg. ${candidate.regNumber}`, candidate.email, candidate.sitting?.name && `Sitting: ${candidate.sitting.name}`, candidate.extraTimePct ? `+${candidate.extraTimePct}% time` : null]
                .filter(Boolean)
                .join(" · ") || "External candidate"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge color={ATTEMPT_STATUS_COLOR[attempt.status]}>{ATTEMPT_STATUS_LABEL[attempt.status] ?? attempt.status}</Badge>
              {attempt.submitReason ? <Badge>Ended: {SUBMIT_REASON_LABEL[attempt.submitReason] ?? attempt.submitReason}</Badge> : null}
              {attempt.gradingStatus === "PENDING" ? <Badge color="var(--warning)">Waiting for marks</Badge> : null}
              {attempt.releasedAt ? <Badge color="var(--success)">Result released</Badge> : attempt.status === "SUBMITTED" || attempt.status === "TERMINATED" ? <Badge>Not released</Badge> : null}
              {attempt.attemptNo > 1 ? <Badge>Attempt {attempt.attemptNo}</Badge> : null}
            </div>
          </div>
          <div className="text-right">
            <p className="font-heading text-4xl leading-none">{attempt.scorePercent === null ? "—" : pct(attempt.scorePercent, 1)}</p>
            <p className="mt-1 text-sm font-bold">
              {attempt.scorePoints === null ? "Not scored yet" : `${num(attempt.scorePoints)} / ${num(attempt.maxPoints)} marks`}
              {attempt.grade ? ` · Grade ${attempt.grade}` : ""}
            </p>
            {attempt.passed !== null ? (
              <p className={cn("text-sm font-bold", attempt.passed ? "text-foreground" : "text-destructive")}>
                {attempt.passed ? "Pass" : "Fail"} (pass mark {data.exam.passMark}%)
              </p>
            ) : null}
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Started">{when(attempt.startedAt, fmt)}</Fact>
          <Fact label="Submitted">{when(attempt.submittedAt, fmt, attempt.open ? "Still sitting" : "—")}</Fact>
          <Fact label="Time taken">{minutes === null ? (attempt.open ? `${clock(attempt.remainingMs)} left` : "—") : `${num(minutes, 1)} min`}</Fact>
          <Fact label="Deadline">{when(attempt.deadlineAt, fmt)}</Fact>
          <Fact label="Extra time given">{attempt.extraSec ? seconds(attempt.extraSec) : "None"}</Fact>
          <Fact label="Answered">{`${attempt.answeredCount} of ${items.filter((i) => i.verdict !== "removed").length}`}</Fact>
          <Fact label="Violations">{attempt.violationCount}</Fact>
          <Fact label="Safe Exam Browser">{attempt.sebVerified ? "Verified" : "Not used"}</Fact>
          <Fact label="Offline answers after time">{attempt.offlineSubmitted ? "Yes" : "No"}</Fact>
          <Fact label="IP address">{attempt.ip ?? "—"}</Fact>
          <Fact label="Last heartbeat">{when(attempt.lastHeartbeatAt, fmt)}</Fact>
          <Fact label="Device">
            <span className="block truncate" title={attempt.userAgent ?? undefined}>
              {attempt.userAgent ?? "—"}
            </span>
          </Fact>
        </dl>

        {attempt.sectionScores && data.sections.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {data.sections.map((s) => {
              const sc = attempt.sectionScores?.[s.id];
              return sc ? (
                <span key={s.id} className="rounded-[10px] border-2 border-border px-3 py-1.5 text-[13px] font-bold">
                  {s.title}: {num(sc.earned)} / {num(sc.max)}
                </span>
              ) : null;
            })}
          </div>
        ) : null}

        {actions.length ? (
          <div className="flex flex-wrap gap-2 border-t-2 border-dashed border-border pt-4">
            <span className="mr-1 self-center text-[13px] font-bold">Invigilator:</span>
            {actions.map((a) => (
              <Button
                key={a}
                size="sm"
                variant={a === "terminate" ? "destructive" : "outline"}
                disabled={controls.busy}
                onClick={() => void controls.run(a, [{ attemptId: attempt.id, name: candidate.fullName }])}
              >
                {ACTION_LABEL[a]}
              </Button>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Question filter */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show questions">
            {(
              [
                ["all", `All (${items.length})`],
                ["wrong", `Wrong or blank (${counts.incorrect + counts.partial + counts.unanswered})`],
                ["marking", `Needs marking (${counts.marking})`],
                ["flagged", `Flagged by candidate (${items.filter((i) => i.response?.flagged).length})`],
              ] as const
            ).map(([k, label]) => (
              <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {label}
              </Button>
            ))}
            {counts.marking && canGrade ? (
              <Button size="sm" variant="link" asChild>
                <Link href={`/admin/exams/${examId}/marking`}>Go to marking</Link>
              </Button>
            ) : null}
          </div>

          {data.sections.map((s) => {
            const shown = s.items.filter(show);
            if (!shown.length) return null;
            return (
              <section key={s.id} aria-labelledby={`sec-${s.id}`} className="flex flex-col gap-4">
                {data.sections.length > 1 ? (
                  <h2 id={`sec-${s.id}`} className="font-heading text-lg">
                    {s.title}
                  </h2>
                ) : (
                  <h2 id={`sec-${s.id}`} className="sr-only">
                    Questions
                  </h2>
                )}
                {shown.map((it) => (
                  <ReviewQuestion key={it.key} item={it} examId={examId} canGrade={canGrade} />
                ))}
              </section>
            );
          })}
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="p-4">
            <h2 className="font-heading text-base">Summary</h2>
            <ul className="mt-2 flex flex-col gap-1 text-[13.5px]">
              <SummaryRow verdict="correct" n={counts.correct} />
              <SummaryRow verdict="partial" n={counts.partial} />
              <SummaryRow verdict="incorrect" n={counts.incorrect} />
              <SummaryRow verdict="unanswered" n={counts.unanswered} />
              <SummaryRow verdict="needs_marking" n={counts.marking} />
            </ul>
          </Card>
          <Card className="p-4 lg:sticky lg:top-4 lg:max-h-[80vh] lg:overflow-y-auto">
            <h2 className="font-heading text-base">Integrity timeline</h2>
            <p className="mb-2 text-[12px] font-medium text-muted-foreground">{data.events.length} events, oldest first.</p>
            <EventTimeline events={data.events} fmt={fmt} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function SummaryRow({ verdict, n }: { verdict: ItemVerdict; n: number }) {
  const v = VERDICT[verdict];
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2">
        <span className="size-2.5 rounded-full border border-border" style={{ background: v.color }} aria-hidden />
        {v.label}
      </span>
      <span className="font-bold tabular-nums">{n}</span>
    </li>
  );
}

function ReviewQuestion({ item, examId, canGrade }: { item: ReviewItem; examId: string; canGrade: boolean }) {
  const v = VERDICT[item.verdict];
  const r = item.response;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold text-muted-foreground">
          {item.n ? `Question ${item.n}` : "Question"} · {item.typeLabel}
        </h3>
        <span className="flex flex-wrap items-center gap-1.5">
          {r?.flagged ? (
            <Badge>
              <Icon name="tag" className="size-3" /> Flagged
            </Badge>
          ) : null}
          <Badge color={v.color}>
            <Icon name={v.icon} className="size-3" /> {v.label}
          </Badge>
          <span className="text-[13px] font-bold tabular-nums">
            {item.earned === null ? "?" : num(item.earned)} / {num(item.points)}
          </span>
        </span>
      </div>

      {item.type && item.verdict !== "removed" ? (
        <QuestionPlayer
          question={{ id: item.questionId, type: item.type, prompt: item.prompt, view: item.view, media: (item.media as Media | null) ?? null }}
          value={r?.answer ?? null}
          onChange={noop}
          disabled
        />
      ) : (
        <p className="text-sm font-medium text-muted-foreground">{item.prompt}</p>
      )}

      {r?.file ? (
        <a
          className="inline-flex w-fit items-center gap-2 rounded-[10px] border-2 border-border bg-card px-3 py-2 text-[13.5px] font-bold shadow-sm hover:bg-accent"
          href={r.file.url}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name={item.type === "AUDIO_RESPONSE" ? "audio" : "file"} className="size-4" /> Open the candidate&apos;s {item.type === "AUDIO_RESPONSE" ? "recording" : "file"}: {r.file.name}
          <Icon name="external-link" className="size-3.5" />
        </a>
      ) : null}

      {item.answerKey.length ? (
        <div className="rounded-[10px] border-2 border-border bg-success/10 px-3 py-2">
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Correct answer</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {item.answerKey.map((line, i) => (
              <li key={i} className="text-[13.5px] font-medium">
                <MathText>{line}</MathText>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.rubric ? (
        <details className="text-[13.5px]">
          <summary className="cursor-pointer font-bold">Rubric</summary>
          <ul className="mt-1 list-disc pl-5">
            {item.rubric.criteria.map((c) => (
              <li key={c.id}>
                <strong>{c.label}</strong> (weight {c.weight}){c.description ? ` — ${c.description}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {item.explanation ? (
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Explanation</p>
          <MathText as="div" className="text-[13.5px]">
            {item.explanation}
          </MathText>
        </div>
      ) : null}

      {r && (r.manualPoints !== null || r.aiSuggestion || r.feedback) ? (
        <div className="flex flex-col gap-2 border-t-2 border-dashed border-border pt-3 text-[13.5px]">
          {r.manualPoints !== null ? (
            <p>
              <strong>Marked {num(r.manualPoints)} / {num(item.points)}</strong>
              {r.markedBy ? ` by ${r.markedBy}` : ""}
            </p>
          ) : null}
          {r.aiSuggestion ? (
            <p className="text-muted-foreground">
              <Icon name="sparkles" className="mr-1 inline size-3.5" />
              AI suggested {num(r.aiSuggestion.points)} / {num(item.points)}
              {r.aiSuggestion.feedback ? ` — ${r.aiSuggestion.feedback}` : ""}
            </p>
          ) : null}
          {r.feedback ? (
            <p>
              <span className="font-bold">Feedback: </span>
              {r.feedback}
            </p>
          ) : null}
        </div>
      ) : null}

      {item.verdict === "needs_marking" && canGrade ? (
        <Button size="sm" variant="outline" className="w-fit" asChild>
          <Link href={`/admin/exams/${examId}/marking`}>Mark this answer</Link>
        </Button>
      ) : null}
      {r?.timeSpentSec ? <p className="text-[12px] font-medium text-muted-foreground">Time on this question: {seconds(r.timeSpentSec)}</p> : null}
    </Card>
  );
}
