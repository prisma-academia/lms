"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/client/api";
import type { MarkingGroup, MarkingItem, MarkingQueue } from "@/lib/exams/marking";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { FormField, TextArea, TextInput } from "@/components/form-field";
import { MathText } from "@/components/assessments/math-text";
import { Icon } from "@/components/icon";
import { num, seconds } from "@/components/exam-ops/format";
import { cn } from "@/lib/utils";

const FLAG_LABEL: Record<string, string> = {
  off_topic: "Off topic",
  too_short: "Too short",
  possible_plagiarism: "Possible plagiarism",
  non_answer: "Not an answer",
};

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function Marker({ examId, canReview }: { examId: string; canReview: boolean }) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [blind, setBlind] = useState(false);
  const [data, setData] = useState<MarkingQueue | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [showMarked, setShowMarked] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [points, setPoints] = useState("");
  const [feedback, setFeedback] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void apiGet<MarkingQueue>(`/api/tenant/exams/${examId}/marking?include=all${blind ? "&blind=1" : ""}`).then((res) => {
      if (!live) return;
      if (res.data) {
        setData(res.data);
        setLoadError(null);
      } else setLoadError(res.error?.message ?? "Could not load the marking queue.");
    });
    return () => {
      live = false;
    };
  }, [examId, blind, version]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const groups: (MarkingGroup & { markedNow: number; totalNow: number })[] = useMemo(
    () =>
      (data?.groups ?? []).map((g) => {
        const mine = items.filter((i) => i.questionId === g.questionId);
        return { ...g, totalNow: mine.length, markedNow: mine.filter((i) => i.manualPoints !== null).length };
      }),
    [data, items]
  );
  const queue = useMemo(
    () => items.filter((i) => (!groupId || i.questionId === groupId) && (showMarked || i.manualPoints === null)),
    [items, groupId, showMarked]
  );
  const index = Math.max(0, cursor ? queue.findIndex((i) => i.responseId === cursor) : 0);
  const current: MarkingItem | null = queue[index] ?? queue[0] ?? null;
  const group = current ? groups.find((g) => g.questionId === current.questionId) ?? null : null;
  const totalMarked = items.filter((i) => i.manualPoints !== null).length;
  const withSuggestion = items.filter((i) => i.manualPoints === null && i.aiSuggestion).length;

  // The form follows the answer on screen.
  const shownId = current?.responseId ?? null;
  const [formFor, setFormFor] = useState<string | null>(null);
  if (shownId !== formFor) {
    setFormFor(shownId);
    setPoints(current?.manualPoints != null ? String(current.manualPoints) : "");
    setFeedback(current?.feedback ?? "");
    setFormError(null);
  }

  function go(delta: number) {
    if (!queue.length) return;
    const next = queue[Math.min(queue.length - 1, Math.max(0, index + delta))];
    setCursor(next.responseId);
  }

  function applyLocal(responseId: string, patch: Partial<MarkingItem>) {
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.responseId === responseId ? { ...i, ...patch } : i)) } : d));
  }

  /** After a mark, move to the next answer still to mark (or the next one, when showing marked). */
  function advanceFrom(responseId: string) {
    const pos = queue.findIndex((i) => i.responseId === responseId);
    const after = queue.slice(pos + 1).find((i) => showMarked || i.manualPoints === null);
    const before = queue.slice(0, pos).find((i) => i.manualPoints === null);
    setCursor((after ?? before)?.responseId ?? null);
  }

  async function save() {
    if (!current || saving) return;
    const p = Number(points);
    if (points.trim() === "" || !Number.isFinite(p)) return setFormError("Enter a mark.");
    if (p < 0 || p > current.maxPoints) return setFormError(`The mark must be between 0 and ${current.maxPoints}.`);
    if (Math.abs(p * 2 - Math.round(p * 2)) > 1e-9) return setFormError("Marks go in steps of 0.5.");
    setSaving(true);
    const res = await apiPost<{ points: number }>(`/api/tenant/exams/${examId}/marking/${current.responseId}`, {
      points: p,
      feedback: feedback.trim() || undefined,
    });
    setSaving(false);
    if (res.error) return setFormError(res.error.message);
    applyLocal(current.responseId, { manualPoints: p, feedback: feedback.trim() || null, markedAt: new Date().toISOString() });
    advanceFrom(current.responseId);
    toast(`Saved: ${num(p)} / ${num(current.maxPoints)}.`);
  }

  // The key handler is bound once and always calls the latest go/save.
  const keys = useRef({ go, save });
  useEffect(() => {
    keys.current = { go, save };
  });

  async function acceptOne() {
    if (!current?.aiSuggestion) return;
    setSaving(true);
    const res = await apiPost<{ accepted: number }>(`/api/tenant/exams/${examId}/marking/accept-ai`, { responseIds: [current.responseId] });
    setSaving(false);
    if (res.error) return setFormError(res.error.message);
    const p = Math.min(current.maxPoints, Math.max(0, Math.round(current.aiSuggestion.points * 2) / 2));
    applyLocal(current.responseId, { manualPoints: p, feedback: current.feedback ?? (current.aiSuggestion.feedback || null) });
    advanceFrom(current.responseId);
    toast(`AI suggestion accepted: ${num(p)} / ${num(current.maxPoints)}.`);
  }

  async function acceptAll() {
    if (!withSuggestion) return;
    const yes = await confirm({
      title: `Accept all ${withSuggestion} AI suggestions?`,
      description:
        "Every unmarked essay with an AI-suggested mark gets that mark, recorded as accepted by you. Results that are then complete may be released automatically, depending on the exam's release setting. You can still change any mark afterwards.",
      confirmLabel: "Accept all",
    });
    if (!yes) return;
    setSaving(true);
    const res = await apiPost<{ accepted: number; attempts: number }>(`/api/tenant/exams/${examId}/marking/accept-ai`, {});
    setSaving(false);
    if (res.error) return toast(res.error.message);
    toast(`Accepted ${res.data?.accepted ?? 0} marks across ${res.data?.attempts ?? 0} attempts.`);
    setVersion((v) => v + 1);
  }

  // Keyboard: J/K move, Enter saves (Ctrl/Cmd+Enter from the feedback box).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.defaultPrevented) return;
      const typing = isTyping(e.target);
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void keys.current.save();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey) return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        keys.current.go(1);
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        keys.current.go(-1);
      } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) {
        e.preventDefault();
        void keys.current.save();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        document.getElementById("mark-points")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!data) {
    if (loadError) {
      return (
        <Card>
          <p role="alert" className="text-sm font-bold text-destructive">
            {loadError}
          </p>
          <Button className="mt-3" variant="outline" onClick={() => setVersion((v) => v + 1)}>
            Try again
          </Button>
        </Card>
      );
    }
    return (
      <div role="status" aria-busy="true" className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <span className="sr-only">Loading the marking queue…</span>
        <Skeleton className="h-72" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState icon="check-circle" title="Nothing to mark">
          No submitted answers need a person&apos;s mark yet. Essays, uploads, recordings and code appear here once candidates submit.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Progress and options */}
      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">
            {totalMarked} of {items.length} answers marked
          </p>
          <ProgressBar className="mt-2" value={(totalMarked / items.length) * 100} label="Answers marked" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] font-bold">
            <Checkbox
              checked={blind}
              onCheckedChange={(v) => {
                setBlind(v === true);
                setData(null);
              }}
            />
            Blind marking
          </label>
          <label className="flex items-center gap-2 text-[13px] font-bold">
            <Checkbox checked={showMarked} onCheckedChange={(v) => setShowMarked(v === true)} />
            Show marked
          </label>
          <Button variant="outline" size="sm" disabled={!withSuggestion || saving} onClick={() => void acceptAll()}>
            <Icon name="sparkles" /> Accept all AI suggestions ({withSuggestion})
          </Button>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {/* Questions */}
        <nav aria-label="Questions to mark" className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setGroupId(null);
              setCursor(null);
            }}
            aria-pressed={groupId === null}
            className={cn(
              "rounded-[12px] border-2 border-border px-3 py-2 text-left text-[13.5px] font-bold outline-none focus-visible:outline-[3px] focus-visible:outline-ring",
              groupId === null ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"
            )}
          >
            All questions · {items.length - totalMarked} to mark
          </button>
          {groups.map((g) => (
            <button
              key={g.questionId}
              type="button"
              onClick={() => {
                setGroupId(g.questionId);
                setCursor(null);
              }}
              aria-pressed={groupId === g.questionId}
              className={cn(
                "flex flex-col gap-1.5 rounded-[12px] border-2 border-border px-3 py-2 text-left outline-none focus-visible:outline-[3px] focus-visible:outline-ring",
                groupId === g.questionId ? "bg-accent text-accent-foreground ring-2 ring-foreground" : "bg-card hover:bg-accent"
              )}
            >
              <span className="line-clamp-2 text-[13px] font-bold">{g.prompt}</span>
              <span className="flex items-center justify-between gap-2 text-[11.5px] font-bold text-muted-foreground">
                <span>
                  {g.typeLabel} · {num(g.points)} pts
                </span>
                <span>
                  {g.markedNow}/{g.totalNow}
                </span>
              </span>
              <ProgressBar size="sm" value={g.totalNow ? (g.markedNow / g.totalNow) * 100 : 0} label={`${g.markedNow} of ${g.totalNow} marked`} />
            </button>
          ))}
        </nav>

        {/* The marker */}
        {!current ? (
          <Card>
            <EmptyState icon="check-circle" title="All marked">
              {groupId ? "Every answer to this question has a mark." : "Every answer has a mark."} Tick “Show marked” to review or change one.
            </EmptyState>
          </Card>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold" aria-live="polite">
                Answer {index + 1} of {queue.length}
                {group ? ` · ${group.typeLabel}` : ""}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => go(-1)} disabled={index === 0} aria-keyshortcuts="K">
                  <Icon name="arrow-left" /> Previous
                </Button>
                <Button size="sm" variant="outline" onClick={() => go(1)} disabled={index >= queue.length - 1} aria-keyshortcuts="J">
                  Next <Icon name="arrow-right" />
                </Button>
              </div>
            </div>

            <Card className="flex flex-col gap-4">
              {group ? (
                <div>
                  <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Question</h2>
                  <MathText as="div" className="mt-1 text-[16px] font-semibold leading-relaxed">
                    {group.prompt}
                  </MathText>
                </div>
              ) : null}
              {group?.rubric ? (
                <div>
                  <h3 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Rubric</h3>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {group.rubric.criteria.map((c) => (
                      <li key={c.id} className="rounded-[10px] border-2 border-border px-3 py-2">
                        <p className="text-[13.5px] font-bold">
                          {c.label} <span className="font-medium text-muted-foreground">· weight {c.weight}</span>
                        </p>
                        {c.description ? <p className="text-[13px] text-muted-foreground">{c.description}</p> : null}
                      </li>
                    ))}
                  </ul>
                  {group.rubric.modelAnswer ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[13px] font-bold">Model answer</summary>
                      <p className="mt-1 whitespace-pre-wrap text-[13.5px]">{group.rubric.modelAnswer}</p>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </Card>

            <Card className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-base">
                  {current.fullName ? `${current.fullName} · ` : ""}
                  <span className="font-mono">{current.candidateNo}</span>
                </h2>
                <span className="flex flex-wrap items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
                  {current.wordCount !== null ? (
                    <Badge>
                      {current.wordCount} words
                      {group?.rubric?.minWords ? ` (min ${group.rubric.minWords})` : ""}
                      {group?.rubric?.maxWords ? ` (max ${group.rubric.maxWords})` : ""}
                    </Badge>
                  ) : null}
                  {current.timeSpentSec ? <Badge>{seconds(current.timeSpentSec)} on it</Badge> : null}
                  {current.manualPoints !== null ? <Badge color="var(--success)">Marked {num(current.manualPoints)}</Badge> : null}
                  {canReview && !blind ? (
                    <Link className="underline decoration-2 underline-offset-2" href={`/admin/exams/${examId}/attempts/${current.attemptId}`}>
                      Whole attempt
                    </Link>
                  ) : null}
                </span>
              </div>
              <AnswerView item={current} language={group?.language ?? null} />
            </Card>

            {current.aiSuggestion ? (
              <Card className="flex flex-col gap-3" accent="var(--chart-1)">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 font-heading text-base">
                    <Icon name="sparkles" className="size-4" /> AI suggestion: {num(current.aiSuggestion.points)} / {num(current.maxPoints)}
                  </h2>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPoints(String(Math.round(current.aiSuggestion!.points * 2) / 2));
                        if (!feedback.trim()) setFeedback(current.aiSuggestion!.feedback);
                        document.getElementById("mark-points")?.focus();
                      }}
                    >
                      Edit before saving
                    </Button>
                    <Button size="sm" disabled={saving} onClick={() => void acceptOne()}>
                      <Icon name="check" /> Accept
                    </Button>
                  </div>
                </div>
                {current.aiSuggestion.flags.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {current.aiSuggestion.flags.map((f) => (
                      <Badge key={f} color="var(--warning)">
                        <Icon name="alert-triangle" className="size-3" /> {FLAG_LABEL[f] ?? f}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {current.aiSuggestion.criteria.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {current.aiSuggestion.criteria.map((c) => {
                      const crit = group?.rubric?.criteria.find((x) => x.id === c.id);
                      return (
                        <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-[10px] border-2 border-border px-3 py-2">
                          <span className="text-[13.5px] font-bold">{crit?.label ?? c.id}</span>
                          <span className="text-[13px] font-bold tabular-nums">{Math.round(c.score01 * 100)}%</span>
                          {c.comment ? <span className="col-span-2 text-[13px] text-muted-foreground">{c.comment}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {current.aiSuggestion.feedback ? <p className="text-[13.5px]">{current.aiSuggestion.feedback}</p> : null}
              </Card>
            ) : null}

            <Card>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <div className="flex flex-wrap items-end gap-3">
                  <FormField
                    label={`Mark (0 – ${num(current.maxPoints)})`}
                    htmlFor="mark-points"
                    error={formError ?? undefined}
                    hint="Steps of 0.5. Press M to jump here."
                    className="w-48"
                  >
                    <TextInput
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={current.maxPoints}
                      step={0.5}
                      value={points}
                      onChange={(e) => {
                        setPoints(e.target.value);
                        setFormError(null);
                      }}
                    />
                  </FormField>
                  <div className="flex gap-2 pb-6" role="group" aria-label="Quick marks">
                    <Button type="button" size="sm" variant="outline" onClick={() => setPoints("0")}>
                      0
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setPoints(String(Math.round(current.maxPoints) / 2))}>
                      ½
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setPoints(String(current.maxPoints))}>
                      Full ({num(current.maxPoints)})
                    </Button>
                  </div>
                </div>
                <FormField label="Feedback for the candidate (optional)" htmlFor="mark-feedback" hint="Shown with their result if the exam's review mode allows it.">
                  <TextArea value={feedback} maxLength={3000} onChange={(e) => setFeedback(e.target.value)} />
                </FormField>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[12px] font-medium text-muted-foreground">
                    <kbd className="rounded border border-border px-1">J</kbd>/<kbd className="rounded border border-border px-1">K</kbd> next / previous ·{" "}
                    <kbd className="rounded border border-border px-1">Enter</kbd> save (Ctrl+Enter in the feedback box)
                  </p>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save & next"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function AnswerView({ item, language }: { item: MarkingItem; language: string | null }) {
  if (item.type === "ESSAY") {
    return <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-[10px] border-2 border-border bg-background p-4 text-[15px] leading-relaxed">{item.text}</div>;
  }
  if (item.type === "CODE") {
    return (
      <div className="flex flex-col gap-2">
        {language ? <span className="text-[12px] font-bold uppercase text-muted-foreground">{language}</span> : null}
        <pre className="max-h-[32rem] overflow-auto rounded-[10px] border-2 border-border bg-[#0f172a] p-4 font-mono text-[13.5px] leading-relaxed text-slate-100">
          <code>{item.text}</code>
        </pre>
        {item.keywordHint ? (
          <p className="text-[13px] font-medium text-muted-foreground">
            Keyword hint: {Math.round(item.keywordHint.suggested * 100)}% of the marker&apos;s keywords found
            {item.keywordHint.found.length ? ` (${item.keywordHint.found.join(", ")})` : ""}. A hint only — not a mark.
          </p>
        ) : null}
      </div>
    );
  }
  if (!item.file) return <p className="text-sm font-bold text-destructive">The uploaded file is missing or cannot be opened.</p>;
  if (item.type === "AUDIO_RESPONSE") {
    return (
      <div className="flex flex-col gap-2">
        <audio controls preload="metadata" src={item.file.url} className="w-full">
          <a href={item.file.url}>Download the recording</a>
        </audio>
        <p className="text-[12.5px] font-medium text-muted-foreground">
          {item.file.durationSec ? `${seconds(item.file.durationSec)} · ` : ""}
          <a className="underline" href={item.file.url} target="_blank" rel="noreferrer">
            Open the recording
          </a>
        </p>
      </div>
    );
  }
  const isImage = item.file.type.startsWith("image/");
  return (
    <div className="flex flex-col gap-3">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL; next/image cannot optimise it
        <img src={item.file.url} alt={`Uploaded answer: ${item.file.name}`} className="max-h-[32rem] w-auto rounded-[10px] border-2 border-border object-contain" />
      ) : null}
      <a
        className="inline-flex w-fit items-center gap-2 rounded-[10px] border-2 border-border bg-card px-3 py-2 text-[13.5px] font-bold shadow-sm hover:bg-accent"
        href={item.file.url}
        target="_blank"
        rel="noreferrer"
      >
        <Icon name="file" className="size-4" /> {item.file.name} · {Math.max(1, Math.round(item.file.size / 1024))} KB
        <Icon name="external-link" className="size-3.5" />
      </a>
    </div>
  );
}
