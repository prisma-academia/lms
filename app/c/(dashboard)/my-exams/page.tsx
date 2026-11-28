import { requireClientPage } from "@/lib/auth/page-guards";
import { learnerExamList } from "@/lib/exams/access";
import { windowState } from "@/lib/exams/timing";
import { PageHeader } from "@/components/shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * Every exam this learner can sit or has sat: invited, enrolled-course and
 * access-code exams, with their window, attempts and released results.
 * Each opens the exam lobby (/exam/<id>), which runs the exam in its own window.
 */

const STATE: Record<string, { label: string; tone: string }> = {
  upcoming: { label: "Upcoming", tone: "border-[var(--info)] text-[var(--info)]" },
  open: { label: "Open now", tone: "border-[var(--success)] bg-[var(--success)] text-white" },
  entry_closed: { label: "Entry closed", tone: "border-border text-muted-foreground" },
  closed: { label: "Closed", tone: "border-border text-muted-foreground" },
  draft: { label: "Not open", tone: "border-border text-muted-foreground" },
  in_progress: { label: "In progress", tone: "border-[var(--warning)] bg-[var(--warning)] text-black" },
  done: { label: "Submitted", tone: "border-border text-foreground" },
};

function when(d: Date | null) {
  return d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
}

export default async function MyExamsPage() {
  const actor = await requireClientPage();
  const { candidates, auto } = await learnerExamList(actor.clientId);
  const now = new Date();

  type Row = {
    id: string;
    title: string;
    code: string | null;
    durationMin: number;
    opensAt: Date | null;
    closesAt: Date | null;
    state: string;
    attempts: string;
    result: string | null;
  };
  const rows: Row[] = [
    ...candidates.map((c) => {
      const last = c.attempts[0];
      const live = last && ["IN_PROGRESS", "PAUSED", "LOCKED"].includes(last.status);
      const ws = windowState(c.exam, c.sitting, now);
      const state = live ? "in_progress" : last && c.exam.attemptsAllowed <= (last.attemptNo ?? 0) ? "done" : ws;
      const result =
        last?.releasedAt && last.scorePercent != null
          ? `${Math.round(last.scorePercent)}%${last.grade ? ` · ${last.grade}` : ""}${last.passed ? " · Pass" : ""}`
          : last?.submittedAt
            ? "Awaiting result"
            : null;
      return {
        id: c.exam.id,
        title: c.exam.title,
        code: c.exam.code,
        durationMin: Math.round(c.exam.durationMin * (1 + c.extraTimePct / 100)),
        opensAt: c.sitting?.startsAt ?? c.exam.opensAt,
        closesAt: c.sitting?.endsAt ?? c.exam.closesAt,
        state,
        attempts: `${last?.attemptNo ?? 0} of ${c.exam.attemptsAllowed}`,
        result,
      };
    }),
    ...auto.map((e) => ({
      id: e.id,
      title: e.title,
      code: e.code,
      durationMin: e.durationMin,
      opensAt: e.opensAt,
      closesAt: e.closesAt,
      state: windowState(e, null, now),
      attempts: `0 of ${e.attemptsAllowed}`,
      result: null,
    })),
  ];
  const order = ["in_progress", "open", "upcoming", "entry_closed", "done", "closed", "draft"];
  rows.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || (a.opensAt?.getTime() ?? 0) - (b.opensAt?.getTime() ?? 0));

  return (
    <div>
      <PageHeader title="My exams" subtitle="Computer-based tests you can sit, are sitting, or have sat." />
      {rows.length === 0 ? (
        <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
          <EmptyState icon="monitor" title="No exams yet">
            When your school schedules a computer-based test for you, it appears here. If you were given an Exam ID and PIN, sign in at{" "}
            <a className="font-bold underline" href="/exam">/exam</a>.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const s = STATE[r.state] ?? STATE.closed;
            return (
              <li key={r.id}>
                <a
                  href={`/exam/${r.id}`}
                  className="flex h-full flex-col gap-3 rounded-[14px] border-2 border-border bg-card p-4 shadow-md outline-none transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[10px] border-2 border-border bg-primary text-primary-foreground">
                      <Icon name="monitor" className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading text-base font-black leading-tight">{r.title}</div>
                      {r.code ? <div className="text-xs font-bold text-muted-foreground">{r.code}</div> : null}
                    </div>
                    <span className={cn("shrink-0 rounded-full border-2 px-2.5 py-0.5 text-xs font-black", s.tone)}>{s.label}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="font-bold text-muted-foreground">Duration</dt>
                    <dd className="font-black">{r.durationMin} min</dd>
                    {r.opensAt ? (
                      <>
                        <dt className="font-bold text-muted-foreground">Opens</dt>
                        <dd className="font-black">{when(r.opensAt)}</dd>
                      </>
                    ) : null}
                    {r.closesAt ? (
                      <>
                        <dt className="font-bold text-muted-foreground">Closes</dt>
                        <dd className="font-black">{when(r.closesAt)}</dd>
                      </>
                    ) : null}
                    <dt className="font-bold text-muted-foreground">Attempts</dt>
                    <dd className="font-black">{r.attempts}</dd>
                    {r.result ? (
                      <>
                        <dt className="font-bold text-muted-foreground">Result</dt>
                        <dd className="font-black">{r.result}</dd>
                      </>
                    ) : null}
                  </dl>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-black">
                    {r.state === "in_progress" ? "Resume" : r.state === "open" ? "Go to exam" : "View"} <Icon name="arrow-right" className="size-4" />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
