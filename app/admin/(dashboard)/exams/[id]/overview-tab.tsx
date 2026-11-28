"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiDelete, apiPost } from "@/lib/client/api";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { ChecklistItem, ExamStatusValue } from "@/lib/exams/admin-dto";
import { formatZoned } from "@/lib/exams/zoned-time";
import { useBuilder } from "./builder-context";
import { Notice, SectionHeading, Stat } from "./ui";

const LEVEL_ICON = { ok: "check-circle", warn: "alert-triangle", error: "x" } as const;
const LEVEL_LABEL = { ok: "Ready", warn: "Check", error: "To fix" } as const;

const linkCard =
  "flex items-center gap-3 rounded-[10px] border-2 border-border bg-card px-3.5 py-3 text-sm font-bold shadow-sm outline-none transition-transform hover:-translate-x-px hover:-translate-y-px hover:shadow-md focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

export function OverviewTab() {
  const { exam, reload, canWrite, canProctor, canGrade, timeZone, origin, goToTab } = useBuilder();
  const router = useRouter();
  const confirm = useConfirm();
  const { toast, celebrate } = useToast();
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const signInUrl = `${origin}/exam`;
  const questionCount = exam.sections.reduce((n, s) => n + s.items.length + s.pools.reduce((m, p) => m + p.count, 0), 0);
  const fixedPoints = exam.sections.reduce((n, s) => n + s.items.reduce((m, it) => m + (it.points ?? it.question.points), 0), 0);
  const hasPools = exam.sections.some((s) => s.pools.length > 0);
  const blocking = exam.checklist.filter((c) => c.level === "error");

  async function publish() {
    setBusy(true);
    setError(null);
    const res = await apiPost<{ ok: boolean; problems: string[] }>(`/api/tenant/exams/${exam.id}/publish`, {});
    setBusy(false);
    if (res.status === 422 && res.data) {
      setProblems(res.data.problems);
      await reload();
      return;
    }
    if (res.error) return setError(res.error.message);
    setProblems([]);
    celebrate();
    toast("Exam published. Candidates can now see it inside its window.");
    await reload();
    router.refresh();
  }

  async function setStatus(status: Exclude<ExamStatusValue, "PUBLISHED">) {
    const copy = {
      DRAFT: {
        title: "Move this exam back to draft?",
        description: "Candidates will no longer see it until it is published again.",
        confirmLabel: "Back to draft",
      },
      CLOSED: {
        title: "Close this exam?",
        description: "No new attempts can start. Anyone sitting it now can finish. You can reopen it later by publishing again.",
        confirmLabel: "Close exam",
      },
      ARCHIVED: {
        title: "Archive this exam?",
        description: "It is hidden from candidates and moved out of the way. Results and attempts are kept.",
        confirmLabel: "Archive",
      },
    }[status];
    if (!(await confirm({ ...copy, destructive: status !== "DRAFT" }))) return;
    setBusy(true);
    setError(null);
    const res = await apiPost<{ status: ExamStatusValue }>(`/api/tenant/exams/${exam.id}/status`, { status });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    toast(status === "DRAFT" ? "Back in draft." : status === "CLOSED" ? "Exam closed." : "Exam archived.");
    await reload();
    router.refresh();
  }

  async function remove() {
    if (
      !(await confirm({
        title: "Delete this exam?",
        description: `"${exam.title}", its paper, ${exam.counts.candidates} ${exam.counts.candidates === 1 ? "candidate" : "candidates"} and sittings are deleted. The questions stay in their banks. This cannot be undone.`,
        confirmLabel: "Delete exam",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    const res = await apiDelete(`/api/tenant/exams/${exam.id}`);
    setBusy(false);
    if (res.error) return setError(res.error.message);
    toast("Exam deleted.");
    router.push("/admin/exams");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(signInUrl);
      toast("Sign-in link copied.");
    } catch {
      toast(`Copy this link: ${signInUrl}`);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Questions" value={questionCount} hint={hasPools ? "including random draws" : undefined} />
          <Stat label="Points" value={hasPools ? `≈${exam.estimatedPoints}` : fixedPoints} hint={`${exam.durationMin} min · pass ${exam.passMark}%`} />
          <Stat label="Candidates" value={exam.counts.candidates} hint={`${exam.sittings.length} ${exam.sittings.length === 1 ? "sitting" : "sittings"}`} />
          <Stat label="Attempts" value={exam.counts.attempts} hint={exam.counts.live ? `${exam.counts.live} live now` : `${exam.counts.submitted} finished`} />
        </div>

        <Card>
          <SectionHeading title="Ready to publish?">
            Everything below is checked again on the server when you publish.
          </SectionHeading>
          <ul className="flex flex-col gap-2">
            {exam.checklist.map((c) => (
              <ChecklistRow key={c.key} item={c} onFix={() => goToTab(fixTab(c.key))} />
            ))}
          </ul>
          {problems.length ? (
            <Notice tone="error" className="mt-4">
              <p className="font-bold">Not published. Fix these first:</p>
              <ul className="mt-1 list-disc pl-4">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {error ? (
            <p role="alert" className="mt-4 text-sm font-bold text-destructive">
              {error}
            </p>
          ) : null}

          {canWrite ? (
            <div className="mt-5 flex flex-wrap gap-2 border-t-2 border-dashed border-border pt-4">
              {exam.status !== "PUBLISHED" ? (
                <Button type="button" onClick={publish} disabled={busy || blocking.length > 0}>
                  <Icon name="play" aria-hidden />
                  {exam.status === "DRAFT" ? "Publish exam" : "Publish again"}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => setStatus("CLOSED")} disabled={busy}>
                  <Icon name="lock" aria-hidden />
                  Close to new attempts
                </Button>
              )}
              {exam.status !== "DRAFT" && exam.counts.attempts === 0 ? (
                <Button type="button" variant="outline" onClick={() => setStatus("DRAFT")} disabled={busy}>
                  Back to draft
                </Button>
              ) : null}
              {exam.status !== "ARCHIVED" && exam.status !== "DRAFT" ? (
                <Button type="button" variant="outline" onClick={() => setStatus("ARCHIVED")} disabled={busy}>
                  <Icon name="archive" aria-hidden />
                  Archive
                </Button>
              ) : null}
              {exam.counts.attempts === 0 ? (
                <Button type="button" variant="destructive" onClick={remove} disabled={busy} className="sm:ml-auto">
                  <Icon name="trash" aria-hidden />
                  Delete
                </Button>
              ) : exam.status === "DRAFT" ? (
                <Button type="button" variant="outline" onClick={() => setStatus("ARCHIVED")} disabled={busy} className="sm:ml-auto">
                  <Icon name="archive" aria-hidden />
                  Archive
                </Button>
              ) : null}
            </div>
          ) : null}
          {canWrite && blocking.length > 0 && exam.status !== "PUBLISHED" ? (
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              Publishing unlocks once the {blocking.length === 1 ? "item marked “To fix” is" : `${blocking.length} items marked “To fix” are`} sorted.
            </p>
          ) : null}
        </Card>

        <Card>
          <SectionHeading title="When">
            Times are in the academy&apos;s time zone ({timeZone}).
          </SectionHeading>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-black uppercase text-muted-foreground">Opens</dt>
              <dd className="mt-0.5 font-bold">{formatZoned(exam.opensAt, timeZone, "When published")}</dd>
            </div>
            <div>
              <dt className="text-xs font-black uppercase text-muted-foreground">Closes</dt>
              <dd className="mt-0.5 font-bold">{formatZoned(exam.closesAt, timeZone, "Not set")}</dd>
            </div>
            <div>
              <dt className="text-xs font-black uppercase text-muted-foreground">Late entry</dt>
              <dd className="mt-0.5 font-bold">{exam.lateEntryMin != null ? `Up to ${exam.lateEntryMin} min after opening` : "Any time while open"}</dd>
            </div>
          </dl>
          {exam.sittings.length ? (
            <ul className="mt-4 flex flex-col gap-1.5 border-t-2 border-dashed border-border pt-3 text-[13px]">
              {exam.sittings.map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2">
                  <span className="font-bold">{s.name}{s.venue ? ` · ${s.venue}` : ""}</span>
                  <span className="text-muted-foreground">
                    {formatZoned(s.startsAt, timeZone, "—")} · {s.candidateCount} {s.candidateCount === 1 ? "candidate" : "candidates"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <SectionHeading title="How candidates get in" />
          <p className="text-[13px] font-medium text-muted-foreground">
            Candidates go to this address and sign in with their Exam ID and PIN{exam.accessMode !== "INVITED" ? ", or open it from their learner dashboard" : ""}.
          </p>
          <div className="mt-3 flex items-stretch gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[10px] border-2 border-border bg-background px-3 py-2 font-mono text-[13px] font-bold" title={signInUrl}>
              {signInUrl}
            </code>
            <Button type="button" variant="outline" size="icon" onClick={copyLink} aria-label="Copy sign-in link">
              <Icon name="clipboard" aria-hidden />
            </Button>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Link href={`/admin/exams/${exam.id}/slips`} className={linkCard}>
              <Icon name="file" className="size-4" aria-hidden />
              <span className="flex-1">Print candidate slips</span>
              <Icon name="chevron-right" className="size-4" aria-hidden />
            </Link>
            <button type="button" onClick={() => goToTab("candidates")} className={cn(linkCard, "text-left")}>
              <Icon name="users" className="size-4" aria-hidden />
              <span className="flex-1">Manage candidates</span>
              <Icon name="chevron-right" className="size-4" aria-hidden />
            </button>
          </div>
        </Card>

        <Card>
          <SectionHeading title="On the day" />
          <div className="flex flex-col gap-2">
            {canProctor ? (
              <Link href={`/admin/exams/${exam.id}/live`} className={linkCard}>
                <Icon name="activity" className="size-4" aria-hidden />
                <span className="flex-1">Live invigilation</span>
                {exam.counts.live ? <span className="num text-xs">{exam.counts.live} live</span> : null}
                <Icon name="chevron-right" className="size-4" aria-hidden />
              </Link>
            ) : null}
            {canGrade ? (
              <Link href={`/admin/exams/${exam.id}/marking`} className={linkCard}>
                <Icon name="check-circle" className="size-4" aria-hidden />
                <span className="flex-1">Marking</span>
                <Icon name="chevron-right" className="size-4" aria-hidden />
              </Link>
            ) : null}
            <Link href={`/admin/exams/${exam.id}/results`} className={linkCard}>
              <Icon name="chart" className="size-4" aria-hidden />
              <span className="flex-1">Results</span>
              <Icon name="chevron-right" className="size-4" aria-hidden />
            </Link>
            <button type="button" onClick={() => goToTab("preview")} className={cn(linkCard, "text-left")}>
              <Icon name="eye" className="size-4" aria-hidden />
              <span className="flex-1">Try it as a candidate</span>
              <Icon name="chevron-right" className="size-4" aria-hidden />
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function fixTab(key: string) {
  switch (key) {
    case "questions":
    case "pools":
      return "paper" as const;
    case "seb":
      return "security" as const;
    case "candidates":
      return "candidates" as const;
    case "sittings":
      return "sittings" as const;
    default:
      return "settings" as const;
  }
}

function ChecklistRow({ item, onFix }: { item: ChecklistItem; onFix: () => void }) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-[10px] border-2 border-border px-3 py-2.5",
        item.level === "error" ? "bg-destructive/10" : item.level === "warn" ? "bg-warning/10" : "bg-background"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-border",
          item.level === "ok" ? "bg-success text-success-foreground" : item.level === "warn" ? "bg-warning text-warning-foreground" : "bg-destructive text-destructive-foreground"
        )}
        aria-hidden
      >
        <Icon name={LEVEL_ICON[item.level]} className="size-3.5" strokeWidth={3} />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-bold">
          {item.label} <span className="sr-only">— {LEVEL_LABEL[item.level]}</span>
        </p>
        <p className="text-[13px] font-medium text-muted-foreground">{item.detail}</p>
      </div>
      {item.level !== "ok" ? (
        <Button type="button" variant="outline" size="xs" onClick={onFix}>
          Fix
        </Button>
      ) : null}
    </li>
  );
}
