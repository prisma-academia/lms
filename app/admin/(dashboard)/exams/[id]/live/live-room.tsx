"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/client/api";
import type { LiveCandidate, LiveSnapshot, LiveState } from "@/lib/exams/live";
import { ATTEMPT_STATUS_COLOR, ATTEMPT_STATUS_LABEL, eventLabel, SUBMIT_REASON_LABEL } from "@/lib/exams/event-labels";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { EventTimeline, type TimelineEvent } from "@/components/exam-ops/timeline";
import { ACTION_LABEL, actionsFor, useProctorControls, type ProctorActionName, type ProctorTarget } from "@/components/exam-ops/proctor-controls";
import { ago, clock, timeOnly, type Fmt } from "@/components/exam-ops/format";
import { cn } from "@/lib/utils";

const POLL_MS = 5000;

type Filter = "all" | "in_progress" | "online" | "offline" | "flagged" | "locked" | "paused" | "not_started" | "submitted";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "flagged", label: "Flagged" },
  { value: "locked", label: "Locked" },
  { value: "paused", label: "Paused" },
  { value: "not_started", label: "Not started" },
  { value: "submitted", label: "Submitted" },
];

const isOpen = (c: LiveCandidate) => !!c.attempt && ["IN_PROGRESS", "PAUSED", "LOCKED"].includes(c.attempt.status);

function matches(c: LiveCandidate, f: Filter): boolean {
  switch (f) {
    case "all":
      return true;
    case "in_progress":
      return c.state === "IN_PROGRESS";
    case "online":
      return isOpen(c) && !!c.attempt?.online;
    case "offline":
      return isOpen(c) && !c.attempt?.online;
    case "flagged":
      return (c.attempt?.violationCount ?? 0) > 0;
    case "locked":
      return c.state === "LOCKED";
    case "paused":
      return c.state === "PAUSED";
    case "not_started":
      return c.state === "NOT_STARTED";
    case "submitted":
      return c.state === "SUBMITTED" || c.state === "TERMINATED";
  }
}

type Announcement = { id: string; message: string; at: string; to: string; by: string | null };

export function LiveRoom({ examId, fmt, canProctor, canReview }: { examId: string; fmt: Fmt; canProctor: boolean; canReview: boolean }) {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failing, setFailing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [wall, setWall] = useState(false);
  const [timelineFor, setTimelineFor] = useState<LiveCandidate | null>(null);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const res = await apiGet<LiveSnapshot>(`/api/tenant/exams/${examId}/live`);
    inFlight.current = false;
    if (res.data) {
      setSnap(res.data);
      setReceivedAt(Date.now());
      setFailing(false);
      setLoadError(null);
      const open = new Set(res.data.candidates.filter(isOpen).map((c) => c.attempt!.id));
      setSelected((prev) => {
        const next = new Set([...prev].filter((id) => open.has(id)));
        return next.size === prev.size ? prev : next;
      });
    } else {
      setFailing(true);
      setLoadError(res.error?.message ?? "Could not load the live room.");
    }
  }, [examId]);

  // Poll every few seconds while the tab is visible; catch up at once when it returns.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const loop = async () => {
      if (stopped) return;
      if (!document.hidden) await poll();
      if (!stopped) timer = setTimeout(loop, POLL_MS);
    };
    const onVisible = () => {
      if (!document.hidden) {
        if (timer) clearTimeout(timer);
        void loop();
      }
    };
    void loop();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  // The countdowns tick locally between polls.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const controls = useProctorControls(examId, poll);

  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      (snap?.candidates ?? []).filter(
        (c) =>
          matches(c, filter) &&
          (!q || c.fullName.toLowerCase().includes(q) || c.candidateNo.toLowerCase().includes(q) || (c.regNumber ?? "").toLowerCase().includes(q))
      ),
    [snap, filter, q]
  );
  const selectable = visible.filter(isOpen);
  const allSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.attempt!.id));
  const someSelected = selectable.some((c) => selected.has(c.attempt!.id));
  const targets: ProctorTarget[] = (snap?.candidates ?? [])
    .filter((c) => c.attempt && selected.has(c.attempt.id))
    .map((c) => ({ attemptId: c.attempt!.id, name: c.fullName }));

  if (!snap) {
    if (loadError) {
      return (
        <Card>
          <p role="alert" className="text-sm font-bold text-destructive">
            {loadError}
          </p>
          <Button className="mt-3" variant="outline" onClick={() => void poll()}>
            Try again
          </Button>
        </Card>
      );
    }
    return (
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading the live room…</span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      </div>
    );
  }

  const s = snap.summary;
  const pausedSittings = snap.sittings.filter((x) => x.pausedAt);
  const elapsed = now - receivedAt;
  const tiles: { label: string; value: number; filter: Filter; tone?: string }[] = [
    { label: "Candidates", value: s.candidates, filter: "all" },
    { label: "Not started", value: s.notStarted, filter: "not_started" },
    { label: "In progress", value: s.inProgress, filter: "in_progress", tone: "var(--info)" },
    { label: "Paused", value: s.paused, filter: "paused", tone: "var(--warning)" },
    { label: "Locked", value: s.locked, filter: "locked", tone: "var(--destructive)" },
    { label: "Submitted", value: s.submitted, filter: "submitted", tone: "var(--success)" },
    { label: "Online", value: s.online, filter: "online" },
    { label: "Offline", value: s.offline, filter: "offline", tone: s.offline ? "var(--warning)" : undefined },
    { label: "Flagged", value: s.flagged, filter: "flagged", tone: s.flagged ? "var(--destructive)" : undefined },
  ];

  return (
    <div className="flex flex-col gap-5">
      {controls.dialogs}

      {/* Connection state */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] font-bold text-muted-foreground" aria-live="polite">
        <span className="inline-flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full border-2 border-border", failing ? "bg-destructive" : "bg-success")} aria-hidden />
          {failing ? "Connection lost — retrying" : "Live"} · updated {ago(new Date(receivedAt).toISOString(), now)}
        </span>
        <span className="inline-flex items-center gap-2">
          <Button size="xs" variant="outline" onClick={() => void poll()}>
            <Icon name="refresh" /> Refresh
          </Button>
          <Button size="xs" variant={wall ? "default" : "outline"} aria-pressed={wall} onClick={() => setWall((w) => !w)}>
            <Icon name={wall ? "minimize" : "maximize"} /> Wall view
          </Button>
        </span>
      </div>
      {failing ? (
        <div role="alert" className="flex items-start gap-3 rounded-[12px] border-2 border-border bg-destructive px-4 py-3 text-destructive-foreground">
          <Icon name="alert-triangle" className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-bold">Connection to the server lost.</p>
            <p className="text-sm">
              Showing what was known {ago(new Date(receivedAt).toISOString(), now)}. Candidates keep working in their exam window; this page catches up when the
              connection returns. {loadError}
            </p>
          </div>
        </div>
      ) : null}

      {pausedSittings.length ? (
        <div role="status" className="flex items-start gap-3 rounded-[12px] border-2 border-border bg-warning px-4 py-3 text-warning-foreground">
          <Icon name="pause" className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm font-bold">
            {pausedSittings.length === 1 ? `Sitting “${pausedSittings[0].name}” is paused` : `${pausedSittings.length} sittings are paused`} — every clock in{" "}
            {pausedSittings.length === 1 ? "it" : "them"} is frozen until it is resumed.
          </p>
        </div>
      ) : null}

      {/* Summary tiles — each one filters the grid */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setFilter(t.filter)}
            aria-pressed={filter === t.filter}
            className={cn(
              "rounded-[12px] border-2 border-border bg-card px-3 py-2 text-left shadow-sm outline-none transition-transform hover:-translate-y-px focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
              filter === t.filter && "ring-2 ring-foreground"
            )}
          >
            <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-muted-foreground">
              {t.tone ? <span className="size-2 rounded-full border border-border" style={{ background: t.tone }} aria-hidden /> : null}
              {t.label}
            </span>
            <span className={cn("block font-heading leading-tight", wall ? "text-3xl" : "text-2xl")}>{t.value}</span>
          </button>
        ))}
      </div>

      {/* Sittings */}
      {snap.sittings.length ? (
        <Card className="p-4">
          <h2 className="font-heading text-base">Sittings</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {snap.sittings.map((st) => (
              <SittingControl key={st.id} examId={examId} sitting={st} canProctor={canProctor} onChanged={poll} />
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div role="group" aria-label="Show" className="inline-flex overflow-hidden rounded-[10px] border-2 border-border shadow-sm">
            {FILTERS.map((f, i) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "min-h-10 whitespace-nowrap px-3 text-[13px] font-bold outline-none focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring",
                  i > 0 && "border-l-2 border-border",
                  filter === f.value ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="w-full lg:w-72">
          <label htmlFor="live-search" className="sr-only">
            Search by name or Exam ID
          </label>
          <TextInput id="live-search" type="search" placeholder="Search name or Exam ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {canProctor && selectable.length ? (
        <div className="flex items-center gap-2 text-[13px] font-bold">
          <Checkbox
            id="live-select-all"
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(v) =>
              setSelected((prev) => {
                const next = new Set(prev);
                for (const c of selectable) {
                  if (v === true) next.add(c.attempt!.id);
                  else next.delete(c.attempt!.id);
                }
                return next;
              })
            }
          />
          <label htmlFor="live-select-all">Select all {selectable.length} live attempts shown</label>
        </div>
      ) : null}

      {/* The grid */}
      {snap.candidates.length === 0 ? (
        <Card>
          <EmptyState icon="users" title="No candidates yet">
            Add candidates to the exam and they will appear here as they sign in.
          </EmptyState>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon="search" title="Nobody matches">
            No candidate matches this filter{q ? " and search" : ""}.
          </EmptyState>
        </Card>
      ) : (
        <ul
          className={cn(
            "grid gap-3",
            wall ? "[grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))]" : "[grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]"
          )}
          aria-label="Candidates"
        >
          {visible.map((c) => (
            <CandidateTile
              key={c.candidateId}
              c={c}
              fmt={fmt}
              wall={wall}
              elapsedMs={elapsed}
              nowMs={now}
              canProctor={canProctor}
              selected={!!c.attempt && selected.has(c.attempt.id)}
              onSelect={(v) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (v) next.add(c.attempt!.id);
                  else next.delete(c.attempt!.id);
                  return next;
                })
              }
              onAction={(a) => void controls.run(a, [{ attemptId: c.attempt!.id, name: c.fullName }])}
              onTimeline={() => setTimelineFor(c)}
              reviewHref={canReview && c.attempt ? `/admin/exams/${examId}/attempts/${c.attempt.id}` : null}
              busy={controls.busy}
            />
          ))}
        </ul>
      )}

      {canProctor ? <MessagePanel examId={examId} snap={snap} fmt={fmt} /> : null}

      {/* Bulk bar */}
      {canProctor && targets.length ? (
        <div
          role="region"
          aria-label="Actions for selected candidates"
          className="sticky bottom-3 z-30 flex flex-wrap items-center gap-2 rounded-[14px] border-2 border-border bg-card p-3 shadow-lg"
        >
          <span className="mr-1 text-sm font-bold">{targets.length} selected</span>
          {(["extend", "pause", "resume", "unlock", "submit", "terminate"] as ProctorActionName[]).map((a) => (
            <Button
              key={a}
              size="sm"
              variant={a === "terminate" ? "destructive" : "outline"}
              disabled={controls.busy}
              onClick={() => void controls.run(a, targets)}
            >
              {ACTION_LABEL[a]}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      <TimelineSheet examId={examId} candidate={timelineFor} fmt={fmt} onClose={() => setTimelineFor(null)} />
    </div>
  );
}

/* ───────────────────────────── a candidate tile ───────────────────────────── */

function CandidateTile({
  c,
  fmt,
  wall,
  elapsedMs,
  nowMs,
  canProctor,
  selected,
  onSelect,
  onAction,
  onTimeline,
  reviewHref,
  busy,
}: {
  c: LiveCandidate;
  fmt: Fmt;
  wall: boolean;
  elapsedMs: number;
  nowMs: number;
  canProctor: boolean;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onAction: (a: ProctorActionName) => void;
  onTimeline: () => void;
  reviewHref: string | null;
  busy: boolean;
}) {
  const a = c.attempt;
  const open = isOpen(c);
  const state: LiveState = c.state;
  const left = a ? (a.paused || !open ? a.remainingMs : Math.max(0, a.remainingMs - elapsedMs)) : 0;
  const lowTime = open && !a?.paused && left < 5 * 60_000;
  const actions = a ? actionsFor(a.status, a.paused) : [];
  const last = a?.events[0];
  const checkId = `pick-${c.candidateId}`;
  return (
    <li
      className={cn(
        "relative flex flex-col gap-2 rounded-[12px] border-2 border-border bg-card p-3 shadow-sm",
        selected && "ring-[3px] ring-ring",
        state === "LOCKED" && "bg-destructive/10",
        state === "PAUSED" && "bg-warning/10"
      )}
      style={{ borderTopWidth: 6, borderTopColor: ATTEMPT_STATUS_COLOR[state] }}
    >
      <div className="flex items-start gap-2">
        {canProctor && open ? (
          <Checkbox id={checkId} checked={selected} onCheckedChange={(v) => onSelect(v === true)} className="mt-0.5" aria-label={`Select ${c.fullName}`} />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-bold leading-tight", wall ? "text-[17px]" : "text-[14px]")} title={c.fullName}>
            {c.fullName}
          </p>
          <p className="truncate text-[12px] font-medium text-muted-foreground">
            {c.candidateNo}
            {c.sitting ? ` · ${c.sitting.name}` : ""}
            {c.extraTimePct ? ` · +${c.extraTimePct}% time` : ""}
          </p>
        </div>
        <Badge color={ATTEMPT_STATUS_COLOR[state]}>{ATTEMPT_STATUS_LABEL[state]}</Badge>
      </div>

      {a ? (
        <>
          <div className="flex items-end justify-between gap-2">
            {open ? (
              <span
                className={cn("font-heading tabular-nums leading-none", wall ? "text-4xl" : "text-[28px]", lowTime && "text-destructive")}
                aria-label={`Time left ${clock(left)}${a.paused ? ", paused" : ""}`}
              >
                {clock(left)}
              </span>
            ) : (
              <span className="text-[13px] font-bold text-muted-foreground">
                {a.submitReason ? `Ended: ${SUBMIT_REASON_LABEL[a.submitReason] ?? a.submitReason}` : "Finished"}
                {a.submittedAt ? ` · ${timeOnly(a.submittedAt, fmt)}` : ""}
              </span>
            )}
            <span className="text-[12px] font-bold tabular-nums text-muted-foreground">
              {a.answeredCount}/{a.totalItems} answered
            </span>
          </div>
          <ProgressBar
            size="sm"
            value={a.totalItems ? (a.answeredCount / a.totalItems) * 100 : 0}
            label={`${c.fullName}: ${a.answeredCount} of ${a.totalItems} answered`}
          />
          <div className="flex flex-wrap gap-1.5">
            {open ? (
              a.online ? (
                <Badge color="var(--success)">
                  <Icon name="activity" className="size-3" /> Online
                </Badge>
              ) : (
                <Badge color="var(--warning)">
                  <Icon name="alert-triangle" className="size-3" /> Offline · seen {ago(a.lastSeen, nowMs)}
                </Badge>
              )
            ) : null}
            {a.violationCount > 0 ? (
              <Badge color="var(--destructive)">
                <Icon name="shield" className="size-3" /> {a.violationCount} violation{a.violationCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {a.sebVerified ? (
              <Badge>
                <Icon name="lock" className="size-3" /> SEB
              </Badge>
            ) : null}
            {a.offlineSubmitted ? <Badge color="var(--warning)">Offline answers</Badge> : null}
            {a.attemptNo > 1 ? <Badge>Attempt {a.attemptNo}</Badge> : null}
          </div>
          <p className="min-h-[1.25rem] truncate text-[12px] font-medium text-muted-foreground" title={last ? eventLabel(last.type) : undefined}>
            {last ? `${eventLabel(last.type)} · ${timeOnly(last.at, fmt)}` : "No events yet"}
          </p>
        </>
      ) : (
        <p className="text-[13px] font-medium text-muted-foreground">
          {c.candidateStatus === "ACTIVE" ? "Has not started yet." : `Candidate is ${c.candidateStatus.toLowerCase()}.`}
        </p>
      )}

      {a ? (
        <div className="mt-auto flex flex-wrap gap-1.5 border-t-2 border-dashed border-border pt-2">
          <Button size="xs" variant="outline" onClick={onTimeline}>
            <Icon name="list" /> Timeline
          </Button>
          {reviewHref ? (
            <Button size="xs" variant="ghost" asChild>
              <Link href={reviewHref}>Review</Link>
            </Button>
          ) : null}
          {canProctor && actions.length ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="xs" variant="outline" className="ml-auto" aria-label={`Actions for ${c.fullName}`} disabled={busy}>
                  <Icon name="more-horizontal" /> Actions
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1.5">
                <ul className="flex flex-col">
                  {actions.map((x) => (
                    <li key={x}>
                      <PopoverClose asChild>
                      <button
                        type="button"
                        onClick={() => onAction(x)}
                        className={cn(
                          "flex min-h-10 w-full items-center rounded-[8px] px-2.5 text-left text-[13.5px] font-bold outline-none hover:bg-accent hover:text-accent-foreground focus-visible:outline-[3px] focus-visible:outline-ring",
                          x === "terminate" && "text-destructive"
                        )}
                      >
                        {ACTION_LABEL[x]}
                      </button>
                      </PopoverClose>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/* ───────────────────────────── sittings ───────────────────────────── */

function SittingControl({
  examId,
  sitting,
  canProctor,
  onChanged,
}: {
  examId: string;
  sitting: LiveSnapshot["sittings"][number];
  canProctor: boolean;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const paused = !!sitting.pausedAt;
  async function toggle() {
    if (!paused) {
      const yes = await confirm({
        title: `Pause the whole sitting “${sitting.name}”?`,
        description: "Every candidate in this sitting is frozen: their clocks stop and they cannot answer until you resume. The paused time is given back.",
        confirmLabel: "Pause sitting",
      });
      if (!yes) return;
    }
    setBusy(true);
    const res = await apiPost<{ changed: number }>(`/api/tenant/exams/${examId}/sittings/${sitting.id}/pause`, { paused: !paused });
    setBusy(false);
    if (res.error) return toast(res.error.message);
    toast(paused ? `Sitting “${sitting.name}” resumed.` : `Sitting “${sitting.name}” paused.`);
    onChanged();
  }
  return (
    <li className={cn("flex items-center gap-2 rounded-[10px] border-2 border-border px-3 py-1.5", paused ? "bg-warning/20" : "bg-card")}>
      <span className="text-[13px] font-bold">{sitting.name}</span>
      {sitting.venue ? <span className="text-[12px] text-muted-foreground">{sitting.venue}</span> : null}
      {paused ? <Badge color="var(--warning)">Paused</Badge> : null}
      {canProctor ? (
        <Button size="xs" variant={paused ? "default" : "outline"} disabled={busy} onClick={() => void toggle()}>
          <Icon name={paused ? "play" : "pause"} /> {paused ? "Resume" : "Pause"}
        </Button>
      ) : null}
    </li>
  );
}

/* ───────────────────────────── messages ───────────────────────────── */

function MessagePanel({ examId, snap, fmt }: { examId: string; snap: LiveSnapshot; fmt: Fmt }) {
  const { toast } = useToast();
  const [target, setTarget] = useState("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Announcement[] | null>(null);

  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    void apiGet<Announcement[]>(`/api/tenant/exams/${examId}/announcements`).then((res) => {
      if (live && res.data) setHistory(res.data);
    });
    return () => {
      live = false;
    };
  }, [examId, version]);

  const options = [
    { value: "all", label: "Everyone in the exam" },
    ...snap.sittings.map((s) => ({ value: `s:${s.id}`, label: `Sitting: ${s.name}` })),
    ...snap.candidates.map((c) => ({ value: `c:${c.candidateId}`, label: `${c.fullName} (${c.candidateNo})` })),
  ];

  async function send() {
    const text = message.trim();
    if (!text) return setError("Write a message first.");
    setBusy(true);
    const res = await apiPost(`/api/tenant/exams/${examId}/announcements`, {
      message: text,
      sittingId: target.startsWith("s:") ? target.slice(2) : null,
      candidateId: target.startsWith("c:") ? target.slice(2) : null,
    });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    setMessage("");
    toast("Message sent. It appears in the exam window within a few seconds.");
    setVersion((v) => v + 1);
  }

  return (
    <Card>
      <h2 className="font-heading text-lg">Message candidates</h2>
      <p className="mt-1 text-sm font-medium text-muted-foreground">Shown as a banner in the exam window. Keep it short.</p>
      <form
        className="mt-4 grid gap-4 lg:grid-cols-[18rem_1fr_auto] lg:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <FormField label="To" htmlFor="msg-target">
          <SelectInput allowEmpty={false} options={options} value={target} onChange={(e) => setTarget(e.target.value)} />
        </FormField>
        <FormField label="Message" htmlFor="msg-text" error={error ?? undefined}>
          <TextArea
            className="min-h-12"
            rows={2}
            maxLength={1000}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setError(null);
            }}
          />
        </FormField>
        <Button type="submit" disabled={busy}>
          <Icon name="mail" /> Send
        </Button>
      </form>
      {history && history.length ? (
        <div className="mt-5">
          <h3 className="text-[13px] font-bold text-muted-foreground">Sent</h3>
          <ul className="mt-2 flex max-h-64 flex-col gap-2 overflow-y-auto">
            {history.map((h) => (
              <li key={h.id} className="rounded-[10px] border-2 border-border px-3 py-2">
                <p className="whitespace-pre-wrap text-[13.5px] font-medium">{h.message}</p>
                <p className="mt-0.5 text-[11.5px] font-bold text-muted-foreground">
                  {h.to} · {timeOnly(h.at, fmt)}
                  {h.by ? ` · ${h.by}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

/* ───────────────────────────── timeline ───────────────────────────── */

type ReviewEvents = { events: TimelineEvent[] };

function TimelineSheet({ examId, candidate, fmt, onClose }: { examId: string; candidate: LiveCandidate | null; fmt: Fmt; onClose: () => void }) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attemptId = candidate?.attempt?.id ?? null;

  useEffect(() => {
    if (!attemptId) return;
    let live = true;
    const load = async () => {
      const res = await apiGet<ReviewEvents>(`/api/tenant/exams/${examId}/attempts/${attemptId}`);
      if (!live) return;
      if (res.data) {
        setEvents(res.data.events);
        setError(null);
      } else setError(res.error?.message ?? "Could not load the timeline.");
    };
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => {
      live = false;
      clearInterval(t);
      setEvents(null);
    };
  }, [examId, attemptId]);

  return (
    <Sheet open={!!candidate} onOpenChange={(o) => (o ? undefined : onClose())}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{candidate?.fullName ?? "Timeline"}</SheetTitle>
          <SheetDescription>
            {candidate?.candidateNo} · every event in order. Red entries count as violations.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {error ? (
            <p role="alert" className="text-sm font-bold text-destructive">
              {error}
            </p>
          ) : events ? (
            <EventTimeline events={events} fmt={fmt} />
          ) : (
            <div aria-busy="true" className="flex flex-col gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
