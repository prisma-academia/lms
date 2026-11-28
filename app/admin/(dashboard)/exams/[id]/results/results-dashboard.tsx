"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet, apiPost } from "@/lib/client/api";
import type { ResultsPayload, ResultRow } from "@/lib/exams/results-data";
import type { ItemFlag, ItemStats } from "@/lib/exams/analytics";
import { ATTEMPT_STATUS_COLOR, ATTEMPT_STATUS_LABEL, SUBMIT_REASON_LABEL } from "@/lib/exams/event-labels";
import { questionType } from "@/lib/assessments/types";
import type { QuestionTypeValue } from "@/lib/schemas/question";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { BarList, ColumnChart } from "@/components/exam-ops/charts";
import { num, pct, seconds, when, type Fmt } from "@/components/exam-ops/format";
import { cn } from "@/lib/utils";

const FLAG: Record<ItemFlag, { label: string; color: string; hint: string }> = {
  too_easy: { label: "Too easy", color: "var(--info)", hint: "More than 90% got it right." },
  too_hard: { label: "Too hard", color: "var(--warning)", hint: "Fewer than 20% got it right." },
  check_key: { label: "Check key", color: "var(--destructive)", hint: "Weaker candidates did better than stronger ones — the answer key may be wrong." },
  weak: { label: "Weak", color: "var(--muted)", hint: "Barely separates strong and weak candidates (D < 0.2)." },
};

const typeLabel = (t: string) => {
  try {
    return questionType(t as QuestionTypeValue).label;
  } catch {
    return t;
  }
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function ResultsDashboard({ examId, fmt, canGrade }: { examId: string; fmt: Fmt; canGrade: boolean }) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<null | "release" | "regrade">(null);

  useEffect(() => {
    let live = true;
    void apiGet<ResultsPayload>(`/api/tenant/exams/${examId}/results`).then((res) => {
      if (!live) return;
      if (res.data) {
        setData(res.data);
        setError(null);
      } else setError(res.error?.message ?? "Could not load the results.");
    });
    return () => {
      live = false;
    };
  }, [examId, version]);

  async function release() {
    if (!data) return;
    const n = data.release.unreleasedGraded;
    const yes = await confirm({
      title: `Release ${n} result${n === 1 ? "" : "s"}?`,
      description: `Candidates with a final mark see their result now, are told it is ready, and any certificate or course progress that depends on a pass is granted.${
        data.release.unreleasedPending ? ` ${data.release.unreleasedPending} attempt(s) still waiting for marks are not released.` : ""
      } Released results cannot be withdrawn.`,
      confirmLabel: "Release results",
    });
    if (!yes) return;
    setBusy("release");
    const res = await apiPost<{ released: number }>(`/api/tenant/exams/${examId}/release`, {});
    setBusy(null);
    if (res.error) return toast(res.error.message);
    toast(`Released ${res.data?.released ?? 0} result(s).`);
    setVersion((v) => v + 1);
  }

  async function regrade() {
    const yes = await confirm({
      title: "Re-grade every finished attempt?",
      description:
        "Scores are recomputed from the stored answers, the current answer keys and the marks already given. Use it after correcting a wrong key. Marks given by people are kept. Already released results update too.",
      confirmLabel: "Re-grade all",
    });
    if (!yes) return;
    setBusy("regrade");
    const res = await apiPost<{ attempts: number; graded: number; pending: number; failed: number }>(`/api/tenant/exams/${examId}/regrade`, {});
    setBusy(null);
    if (res.error) return toast(res.error.message);
    const d = res.data!;
    toast(`Re-graded ${d.attempts}: ${d.graded} final, ${d.pending} waiting for marks${d.failed ? `, ${d.failed} failed` : ""}.`);
    setVersion((v) => v + 1);
  }

  if (!data) {
    if (error) {
      return (
        <Card>
          <p role="alert" className="text-sm font-bold text-destructive">
            {error}
          </p>
          <Button className="mt-3" variant="outline" onClick={() => setVersion((v) => v + 1)}>
            Try again
          </Button>
        </Card>
      );
    }
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-5">
        <span className="sr-only">Loading results…</span>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const a = data.analytics;
  const manualRelease = data.exam.resultRelease !== "IMMEDIATE";
  const canRelease = canGrade && manualRelease && data.release.unreleasedGraded > 0;

  const actions = (
    <div className="flex flex-wrap gap-2">
      {canRelease ? (
        <Button disabled={busy !== null} onClick={() => void release()}>
          <Icon name="share" /> {busy === "release" ? "Releasing…" : `Release results (${data.release.unreleasedGraded})`}
        </Button>
      ) : null}
      {canGrade ? (
        <Button variant="outline" disabled={busy !== null || !a.count} onClick={() => void regrade()}>
          <Icon name="refresh" /> {busy === "regrade" ? "Re-grading…" : "Re-grade all"}
        </Button>
      ) : null}
      <Button variant="outline" asChild>
        <a href={`/api/tenant/exams/${examId}/results/export`} download>
          <Icon name="download" /> Download CSV
        </a>
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          Release: <strong className="text-foreground">{RELEASE_LABEL[data.exam.resultRelease] ?? data.exam.resultRelease}</strong> · {data.release.released} released
          {data.release.unreleasedPending ? ` · ${data.release.unreleasedPending} waiting for marks` : ""}
          {data.scoring ? ` · ${data.scoring} being scored` : ""}
        </p>
        {actions}
      </div>

      {a.count === 0 ? (
        <Card>
          <EmptyState icon="chart" title="No finished attempts yet">
            Statistics appear here once candidates submit. {data.rows.length ? "Attempts in progress are listed below." : ""}
          </EmptyState>
        </Card>
      ) : (
        <>
          <section aria-label="Key figures" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <Kpi label="Finished attempts" value={String(a.count)} />
            <Kpi label="Mean score" value={pct(a.score.mean, 1)} />
            <Kpi label="Median" value={pct(a.score.median, 1)} />
            <Kpi label="Standard deviation" value={a.score.sd === null ? "—" : num(a.score.sd, 1)} />
            <Kpi label="Lowest – highest" value={`${pct(a.score.min)} – ${pct(a.score.max)}`} />
            <Kpi label={`Pass rate (≥ ${data.exam.passMark}%)`} value={a.passRate === null ? "—" : pct(a.passRate * 100)} />
            <Kpi label="Waiting for marks" value={String(a.pending)} tone={a.pending ? "var(--warning)" : undefined} />
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <ChartTitle title="Score distribution" sub="Finished attempts by score, in 10% bands." />
              <ColumnChart
                title="Number of attempts per 10% score band"
                data={a.histogram.map((b, i) => ({
                  label: i === 9 ? "90–100" : `${b.from}–${b.to - 1}`,
                  value: b.count,
                  detail: `${b.count === 1 ? "1 attempt" : `${b.count} attempts`} scoring ${i === 9 ? "90–100" : `${b.from}–${b.to}`}%`,
                }))}
                valueLabel="Attempts"
                xCaption="Score (%)"
              />
            </Card>
            <Card>
              <ChartTitle title="Grades" sub="How many attempts earned each grade band." />
              {a.grades.length ? (
                <BarList
                  title="Attempts per grade"
                  data={a.grades.map((g) => ({ label: g.label, value: g.count, detail: `${a.count ? Math.round((g.count / a.count) * 100) : 0}% of attempts` }))}
                  valueLabel="Attempts"
                />
              ) : (
                <p className="text-sm font-medium text-muted-foreground">The exam has no grade bands.</p>
              )}
            </Card>
            <Card>
              <ChartTitle title="Section averages" sub="Mean percentage of each section's marks." />
              <BarList
                title="Mean percent per section"
                data={a.sections.map((s) => ({ label: s.title, value: s.meanPercent ?? 0, detail: `mean ${num(s.meanEarned)} of ${num(s.max)} marks` }))}
                max={100}
                format={(v) => `${v.toFixed(1)}%`}
                valueLabel="Mean %"
              />
            </Card>
            <Card>
              <ChartTitle
                title="Time taken"
                sub={`Minutes from start to submit. Median ${a.time.summary.median === null ? "—" : `${num(a.time.summary.median, 1)} min`} of ${data.exam.durationMin} allowed.`}
              />
              <ColumnChart
                title="Attempts by minutes taken"
                data={a.time.bins.map((b) => ({
                  label: `${b.from}`,
                  value: b.count,
                  detail: `${b.from}–${b.to} minutes`,
                }))}
                valueLabel="Attempts"
                xCaption={`Minutes (bands of ${a.time.binMinutes})`}
              />
            </Card>
          </div>

          <ItemAnalysis items={a.items} sections={data.sections} />

          <div className="grid gap-5 lg:grid-cols-2">
            <Integrity data={data} examId={examId} />
            <Similarity data={data} examId={examId} />
          </div>
        </>
      )}

      <Candidates rows={data.rows} examId={examId} fmt={fmt} />
    </div>
  );
}

const RELEASE_LABEL: Record<string, string> = {
  IMMEDIATE: "immediately when marked",
  AFTER_CLOSE: "after the exam closes",
  MANUAL: "by staff",
};

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-[14px] border-2 border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
        {tone ? <span className="size-2 rounded-full border border-border" style={{ background: tone }} aria-hidden /> : null}
        {label}
      </div>
      <div className="mt-1 font-heading text-[22px] leading-tight">{value}</div>
    </div>
  );
}

function ChartTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-heading text-lg">{title}</h2>
      {sub ? <p className="text-[13px] font-medium text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/* ───────────────────────────── item analysis ───────────────────────────── */

type SortKey = "n" | "p" | "d" | "r" | "time" | "flags";

function ItemAnalysis({ items, sections }: { items: ItemStats[]; sections: { id: string; title: string }[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "n", dir: 1 });
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const sectionTitle = new Map(sections.map((s) => [s.id, s.title]));
  const rows = useMemo(() => {
    const val = (i: ItemStats): number => {
      switch (sort.key) {
        case "n":
          return i.n;
        case "p":
          return i.p ?? -1;
        case "d":
          return i.d ?? -2;
        case "r":
          return i.r ?? -2;
        case "time":
          return i.avgTimeSec ?? -1;
        case "flags":
          return i.flags.length;
      }
    };
    return items.filter((i) => !onlyFlagged || i.flags.length).sort((x, y) => (val(x) - val(y)) * sort.dir || x.n - y.n);
  }, [items, sort, onlyFlagged]);
  const flagged = items.filter((i) => i.flags.length).length;

  const th = (key: SortKey, label: string, hint?: string, align = "text-right") => {
    const active = sort.key === key;
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={cn("px-2 py-2", align)}>
        <button
          type="button"
          title={hint}
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "n" ? 1 : -1 }))}
          className="inline-flex items-center gap-1 rounded-[6px] font-bold outline-none hover:underline focus-visible:outline-[3px] focus-visible:outline-ring"
        >
          {label}
          {active ? <Icon name={sort.dir === 1 ? "chevron-up" : "chevron-down"} className="size-3.5" /> : null}
        </button>
      </th>
    );
  };

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg">Item analysis</h2>
          <p className="max-w-prose text-[13px] font-medium text-muted-foreground">
            <strong>p</strong> facility (share of the marks earned) · <strong>D</strong> discrimination, top 27% minus bottom 27% · <strong>r</strong> item–rest
            correlation. Flags need at least 5 responses. Open a choice question to see how often each option was picked.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[13px] font-bold">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
          Only flagged ({flagged})
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm font-medium text-muted-foreground">No flagged questions.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[46rem] text-[13px]">
            <caption className="sr-only">Item statistics per question</caption>
            <thead>
              <tr className="border-b-2 border-border text-left">
                {th("n", "#", undefined, "text-left")}
                <th scope="col" className="px-2 py-2 font-bold">
                  Question
                </th>
                {th("p", "p", "Facility: mean share of the marks earned")}
                {th("d", "D", "Discrimination index")}
                {th("r", "r", "Corrected point-biserial correlation")}
                <th scope="col" className="px-2 py-2 text-right font-bold">
                  Responses
                </th>
                {th("time", "Avg time")}
                {th("flags", "Flags", undefined, "text-left")}
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const expanded = open.has(i.key);
                return (
                  <Fragment key={i.key}>
                    <tr className="border-b border-border/40 align-top">
                      <td className="px-2 py-2 font-bold tabular-nums">{i.n}</td>
                      <td className="max-w-[24rem] px-2 py-2">
                        {i.options ? (
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() =>
                              setOpen((s) => {
                                const next = new Set(s);
                                if (next.has(i.key)) next.delete(i.key);
                                else next.add(i.key);
                                return next;
                              })
                            }
                            className="flex items-start gap-1.5 text-left outline-none hover:underline focus-visible:outline-[3px] focus-visible:outline-ring"
                          >
                            <Icon name={expanded ? "chevron-down" : "chevron-right"} className="mt-0.5 size-3.5 shrink-0" />
                            <span className="line-clamp-2 font-medium">{i.prompt}</span>
                          </button>
                        ) : (
                          <span className="line-clamp-2 font-medium">{i.prompt}</span>
                        )}
                        <span className="mt-0.5 block text-[11.5px] font-bold text-muted-foreground">
                          {typeLabel(i.type)} · {num(i.points)} pts{sectionTitle.get(i.sectionId) ? ` · ${sectionTitle.get(i.sectionId)}` : ""}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{i.p === null ? "—" : i.p.toFixed(2)}</td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", i.d !== null && i.d < 0 && "font-bold text-destructive")}>
                        {i.d === null ? "—" : i.d.toFixed(2)}
                      </td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", i.r !== null && i.r < 0 && "font-bold text-destructive")}>
                        {i.r === null ? "—" : i.r.toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {i.responses}
                        {i.omitted ? <span className="block text-[11px] text-muted-foreground">{i.omitted} blank</span> : null}
                        {i.pending ? <span className="block text-[11px] text-muted-foreground">{i.pending} unmarked</span> : null}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{seconds(i.avgTimeSec)}</td>
                      <td className="px-2 py-2">
                        <span className="flex flex-wrap gap-1">
                          {i.flags.map((f) => (
                            <span key={f} title={FLAG[f].hint}>
                              <Badge color={FLAG[f].color}>{FLAG[f].label}</Badge>
                            </span>
                          ))}
                        </span>
                      </td>
                    </tr>
                    {expanded && i.options ? (
                      <tr className="border-b border-border/40">
                        <td />
                        <td colSpan={7} className="px-2 pb-4 pt-1">
                          <BarList
                            title={`How often each option of question ${i.n} was picked`}
                            data={i.options.map((o) => ({
                              label: `${LETTERS[o.index] ?? o.index + 1}. ${o.text}`,
                              value: o.count,
                              detail: o.correct ? "correct option" : undefined,
                            }))}
                            max={Math.max(1, i.answered)}
                            colorFor={(d) => (d.detail ? "var(--success)" : "var(--chart-1)")}
                            marker={(d) =>
                              d.detail ? (
                                <Badge color="var(--success)">
                                  <Icon name="check" className="size-3" /> Key
                                </Badge>
                              ) : null
                            }
                            valueLabel="Picks"
                            table={false}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ───────────────────────────── integrity & similarity ───────────────────────────── */

function Integrity({ data, examId }: { data: ResultsPayload; examId: string }) {
  const i = data.analytics.integrity;
  const stat = (label: string, value: ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5 text-[13.5px]">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="font-bold tabular-nums">{value}</dd>
    </div>
  );
  return (
    <Card>
      <ChartTitle title="Integrity" sub="Violations recorded by the exam window, across finished attempts." />
      <dl>
        {stat("Attempts with a violation", `${i.withViolations} of ${i.attempts}`)}
        {stat("Violations in total", i.totalViolations)}
        {stat("Mean per attempt", i.meanViolations === null ? "—" : num(i.meanViolations))}
        {stat("Most in one attempt", i.maxViolations)}
        {stat("Locked at some point", i.locked)}
        {stat("Answers saved offline after time", i.offlineSubmitted)}
        {stat("Safe Exam Browser verified", i.sebRate === null ? "—" : `${i.sebVerified} (${pct(i.sebRate * 100)})`)}
      </dl>
      <div className="mt-4">
        <h3 className="mb-2 text-[13px] font-bold">Violations per attempt</h3>
        <BarList title="Attempts by number of violations" data={i.distribution.map((d) => ({ label: d.label, value: d.count }))} valueLabel="Attempts" />
      </div>
      {i.topViolators.length ? (
        <div className="mt-4">
          <h3 className="mb-2 text-[13px] font-bold">Most violations</h3>
          <ul className="flex flex-col gap-1">
            {i.topViolators.map((v) => (
              <li key={v.attemptId} className="flex items-center justify-between gap-2 text-[13.5px]">
                <Link href={`/admin/exams/${examId}/attempts/${v.attemptId}`} className="truncate font-bold underline decoration-2 underline-offset-2">
                  {v.label} <span className="font-mono font-medium text-muted-foreground">{v.candidateNo}</span>
                </Link>
                <span className="tabular-nums">{v.violations}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function Similarity({ data, examId }: { data: ResultsPayload; examId: string }) {
  const s = data.analytics.similarity;
  return (
    <Card>
      <ChartTitle
        title="Answer similarity"
        sub="Pairs who got the same choice questions wrong with the SAME wrong answer far more often than other pairs. A prompt to look closer, not proof."
      />
      {!s.ran ? (
        <p className="text-sm font-medium text-muted-foreground">{s.reason}</p>
      ) : s.pairs.length === 0 ? (
        <EmptyState icon="check-circle" title="Nothing unusual">
          {s.pairsCompared} pairs compared over {s.choiceItems} choice questions; on average a pair shares {num(s.meanIdentical, 2)} identical wrong answers.
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-[12.5px] font-medium text-muted-foreground">
            {s.pairsCompared} pairs compared over {s.choiceItems} choice questions. Typical pair: {num(s.meanIdentical, 2)} identical wrong answers (sd{" "}
            {num(s.sdIdentical, 2)}).
          </p>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[30rem] text-[13px]">
              <caption className="sr-only">Candidate pairs with unusually many identical wrong answers</caption>
              <thead>
                <tr className="border-b-2 border-border text-left">
                  <th scope="col" className="px-2 py-2 font-bold">
                    Candidates
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-bold">
                    Identical wrong
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-bold">
                    Of jointly wrong
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-bold">
                    z
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.pairs.map((p) => (
                  <tr key={`${p.a.attemptId}-${p.b.attemptId}`} className="border-b border-border/40">
                    <td className="px-2 py-2">
                      {[p.a, p.b].map((x, k) => (
                        <Link
                          key={x.attemptId}
                          href={`/admin/exams/${examId}/attempts/${x.attemptId}`}
                          className={cn("block truncate font-bold underline decoration-2 underline-offset-2", k && "mt-0.5")}
                        >
                          {x.label} <span className="font-mono font-medium text-muted-foreground">{x.candidateNo}</span>
                        </Link>
                      ))}
                    </td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums">{p.identicalWrong}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {p.jointlyWrong} ({pct(p.share * 100)})
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.z === null ? "—" : num(p.z, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/* ───────────────────────────── candidates ───────────────────────────── */

function Candidates({ rows, examId, fmt }: { rows: ResultRow[]; examId: string; fmt: Fmt }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) => !needle || r.fullName.toLowerCase().includes(needle) || r.candidateNo.toLowerCase().includes(needle) || (r.regNumber ?? "").toLowerCase().includes(needle)
  );
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-heading text-lg">Candidates ({rows.length})</h2>
        <div className="w-full sm:w-72">
          <label htmlFor="results-search" className="sr-only">
            Search by name or Exam ID
          </label>
          <TextInput id="results-search" type="search" placeholder="Search name or Exam ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="users" title="No attempts yet">
          Nobody has started this exam.
        </EmptyState>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[44rem] text-[13.5px]">
            <caption className="sr-only">Every attempt with its score</caption>
            <thead>
              <tr className="border-b-2 border-border text-left">
                <th scope="col" className="px-2 py-2 font-bold">
                  Candidate
                </th>
                <th scope="col" className="px-2 py-2 font-bold">
                  Exam ID
                </th>
                <th scope="col" className="px-2 py-2 text-right font-bold">
                  Score
                </th>
                <th scope="col" className="px-2 py-2 text-right font-bold">
                  %
                </th>
                <th scope="col" className="px-2 py-2 font-bold">
                  Grade
                </th>
                <th scope="col" className="px-2 py-2 font-bold">
                  Status
                </th>
                <th scope="col" className="px-2 py-2 font-bold">
                  Released
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.attemptId} className="border-b border-border/40">
                  <td className="px-2 py-2">
                    <Link href={`/admin/exams/${examId}/attempts/${r.attemptId}`} className="font-bold underline decoration-2 underline-offset-2">
                      {r.fullName}
                    </Link>
                    <span className="block text-[11.5px] font-medium text-muted-foreground">
                      {r.attemptNo > 1 ? `Attempt ${r.attemptNo} · ` : ""}
                      {r.submittedAt ? `submitted ${when(r.submittedAt, fmt)}` : `started ${when(r.startedAt, fmt)}`}
                      {r.submitReason && r.submitReason !== "MANUAL" ? ` · ${SUBMIT_REASON_LABEL[r.submitReason] ?? r.submitReason}` : ""}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono">{r.candidateNo}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.scorePoints === null ? "—" : `${num(r.scorePoints)} / ${num(r.maxPoints)}`}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{pct(r.scorePercent, 1)}</td>
                  <td className="px-2 py-2">
                    {r.grade ?? "—"}
                    {r.passed !== null && r.status !== "IN_PROGRESS" ? (
                      <span className={cn("ml-1.5 text-[11.5px] font-bold", r.passed ? "text-foreground" : "text-destructive")}>{r.passed ? "Pass" : "Fail"}</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex flex-wrap gap-1">
                      <Badge color={ATTEMPT_STATUS_COLOR[r.status]}>{ATTEMPT_STATUS_LABEL[r.status] ?? r.status}</Badge>
                      {r.gradingStatus === "PENDING" ? <Badge color="var(--warning)">Needs marking</Badge> : null}
                      {r.violations ? <Badge>{r.violations} viol.</Badge> : null}
                    </span>
                  </td>
                  <td className="px-2 py-2">{r.releasedAt ? <Badge color="var(--success)">Released</Badge> : <span className="text-muted-foreground">No</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 ? <p className="py-4 text-sm font-medium text-muted-foreground">Nobody matches “{q}”.</p> : null}
        </div>
      )}
    </Card>
  );
}
