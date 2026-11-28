"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client/api";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { QuestionPlayer, type Media } from "@/components/assessments/question-player";
import { MathText } from "@/components/assessments/math-text";
import { isResponseAnswered } from "@/lib/assessments/types";
import { sanitizeHtml } from "@/lib/content/sanitize-html";
import type { ExamPackage } from "@/lib/exams/paper";
import { cn } from "@/lib/utils";
import { useBuilder } from "./builder-context";
import { Notice } from "./ui";

/**
 * "Try as candidate": the paper exactly as one candidate would get it — the
 * same random draw, shuffles and candidate-safe question views — with
 * answers kept on this page only. No attempt is created, nothing is marked,
 * and no lockdown applies.
 */
export function PreviewTab() {
  const { exam } = useBuilder();
  const [data, setData] = useState<{ seed: number; pkg: ExamPackage } | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(seed?: number) {
    setBusy(true);
    setError(null);
    const res = await apiPost<{ seed: number; pkg: ExamPackage }>(`/api/tenant/exams/${exam.id}/preview`, seed != null ? { seed } : {});
    setBusy(false);
    if (res.error) return setError(res.error.message);
    setData(res.data!);
    setAnswers({});
    setSectionId(res.data!.pkg.sections[0]?.id ?? null);
  }

  if (!data) {
    return (
      <Card>
        <EmptyState
          icon="eye"
          title="Try the exam as a candidate"
          action={
            <Button type="button" onClick={() => load()} disabled={busy}>
              <Icon name="play" aria-hidden />
              {busy ? "Drawing a paper…" : "Start preview"}
            </Button>
          }
        >
          See the paper one candidate would get — random draws and shuffling included. Your answers stay on this page; nothing is saved or marked.
        </EmptyState>
        {error ? <Notice tone="error" className="mt-2">{error}</Notice> : null}
      </Card>
    );
  }

  const { pkg } = data;
  const section = pkg.sections.find((s) => s.id === sectionId) ?? pkg.sections[0];
  const items = section ? section.itemKeys.map((k) => pkg.items.find((i) => i.key === k)!).filter(Boolean) : [];
  const answered = pkg.items.filter((i) => isResponseAnswered(i.type, answers[i.key])).length;
  const groups = new Map(pkg.groups.map((g) => [g.id, g]));
  const shownGroups = new Set<string>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] border-2 border-dashed border-border bg-warning/15 px-4 py-3">
        <Icon name="eye" className="size-5 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 basis-64 text-[13px] font-bold">
          Preview — no timer, no lockdown, nothing saved. Paper #{data.seed}: {pkg.items.length} questions, {pkg.totalPoints} points.
        </p>
        <span className="num text-[13px] font-bold" aria-live="polite">
          {answered} / {pkg.items.length} answered
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => load()} disabled={busy}>
          <Icon name="refresh" aria-hidden />
          Another candidate&apos;s paper
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => load(data.seed)} disabled={busy}>
          Restart this paper
        </Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}

      {exam.instructionsHtml ? (
        <Card>
          <p className="mb-1 text-xs font-black uppercase text-muted-foreground">Instructions</p>
          <MathText as="div" className="text-sm">
            {exam.instructionsHtml}
          </MathText>
        </Card>
      ) : null}

      {pkg.sections.length > 1 ? (
        <div role="tablist" aria-label="Sections" className="flex flex-wrap gap-2">
          {pkg.sections.map((s, i) => {
            const done = s.itemKeys.filter((k) => {
              const it = pkg.items.find((x) => x.key === k);
              return it && isResponseAnswered(it.type, answers[k]);
            }).length;
            const active = s.id === section?.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSectionId(s.id)}
                className={cn(
                  "rounded-[10px] border-2 border-border px-3 py-2 text-left text-[13px] font-bold shadow-sm outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"
                )}
              >
                {i + 1}. {s.title}
                <span className="num ml-2 opacity-75">
                  {done}/{s.itemKeys.length}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {section ? (
        <div className="flex flex-col gap-4">
          {section.instructions || section.timeLimitMin ? (
            <Notice>
              {section.timeLimitMin ? <p className="font-bold">This section has its own {section.timeLimitMin}-minute limit.</p> : null}
              {section.instructions ? <MathText as="div">{section.instructions}</MathText> : null}
            </Notice>
          ) : null}
          {items.length === 0 ? <p className="text-sm font-medium text-muted-foreground">This section has no questions.</p> : null}
          {items.map((it) => {
            const group = it.groupId ? groups.get(it.groupId) : undefined;
            const showGroup = group && !shownGroups.has(group.id);
            if (group) shownGroups.add(group.id);
            return (
              <div key={it.key} className="flex flex-col gap-3">
                {showGroup ? (
                  <Card className="bg-background">
                    {group.title ? <p className="mb-2 font-heading text-base">{group.title}</p> : null}
                    <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(group.stimulus) }} />
                  </Card>
                ) : null}
                <Card>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="num font-heading text-base">Question {it.n}</span>
                    <Badge>
                      {it.points} {it.points === 1 ? "point" : "points"}
                    </Badge>
                    {it.timeLimitSec ? <Badge>{Math.round(it.timeLimitSec / 60) || 1} min limit</Badge> : null}
                    {group ? <Badge>Passage{group.title ? `: ${group.title}` : ""}</Badge> : null}
                  </div>
                  <QuestionPlayer
                    question={{ id: it.key, type: it.type, prompt: it.prompt, view: it.view, media: it.media as Media | null }}
                    value={answers[it.key]}
                    onChange={(v) => setAnswers((prev) => ({ ...prev, [it.key]: v }))}
                    eliminator={exam.tools.eliminator}
                  />
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="clipboard" title="The paper is empty" />
      )}
    </div>
  );
}
