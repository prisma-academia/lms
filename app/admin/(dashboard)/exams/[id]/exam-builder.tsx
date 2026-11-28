"use client";

import { useCallback, useMemo, useState } from "react";
import { apiGet } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { CandidateRow, ExamDetail } from "@/lib/exams/admin-dto";
import { BuilderContext, type BuilderLookups, type BuilderTab } from "./builder-context";
import { OverviewTab } from "./overview-tab";
import { PaperTab } from "./paper-tab";
import { SettingsTab } from "./settings-tab";
import { SecurityTab } from "./security-tab";
import { CandidatesTab } from "./candidates-tab";
import { SittingsTab } from "./sittings-tab";
import { PreviewTab } from "./preview-tab";

const TABS: { value: BuilderTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "paper", label: "Paper" },
  { value: "settings", label: "Settings" },
  { value: "security", label: "Security" },
  { value: "candidates", label: "Candidates" },
  { value: "sittings", label: "Sittings" },
  { value: "preview", label: "Preview" },
];

export function ExamBuilder({
  initial,
  initialCandidates,
  lookups,
  timeZone,
  origin,
  canWrite,
  canProctor,
  canGrade,
  initialTab,
}: {
  initial: ExamDetail;
  initialCandidates: CandidateRow[];
  lookups: BuilderLookups;
  timeZone: string;
  origin: string;
  canWrite: boolean;
  canProctor: boolean;
  canGrade: boolean;
  initialTab?: string;
}) {
  const { toast } = useToast();
  const [exam, setExam] = useState(initial);
  const [candidates, setCandidates] = useState(initialCandidates);
  // The open tab lives in the address (`?tab=paper`) so a reload or a shared
  // link lands on the same tab.
  const [tab, setTab] = useState<BuilderTab>(() =>
    TABS.some((t) => t.value === initialTab) ? (initialTab as BuilderTab) : "overview"
  );

  const goToTab = useCallback((next: BuilderTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }, []);

  const reload = useCallback(async () => {
    const res = await apiGet<{ exam: ExamDetail }>(`/api/tenant/exams/${initial.id}`);
    if (res.data?.exam) setExam(res.data.exam);
    else if (res.error) toast(`Could not refresh the exam: ${res.error.message}`);
  }, [initial.id, toast]);

  const reloadCandidates = useCallback(async () => {
    const res = await apiGet<{ candidates: CandidateRow[] }>(`/api/tenant/exams/${initial.id}/candidates`);
    if (res.data?.candidates) setCandidates(res.data.candidates);
    else if (res.error) toast(`Could not refresh candidates: ${res.error.message}`);
  }, [initial.id, toast]);

  const value = useMemo(
    () => ({
      ...lookups,
      exam,
      reload,
      setExam,
      candidates,
      reloadCandidates,
      canWrite,
      canProctor,
      canGrade,
      paperLocked: exam.counts.attempts > 0,
      timeZone,
      origin,
      goToTab,
    }),
    [lookups, exam, reload, setExam, candidates, reloadCandidates, canWrite, canProctor, canGrade, timeZone, origin, goToTab]
  );

  const problems = exam.checklist.filter((c) => c.level === "error").length;

  return (
    <BuilderContext.Provider value={value}>
      <div className="flex flex-col gap-5">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div role="tablist" aria-label="Exam builder" className="inline-flex min-w-max overflow-hidden rounded-[10px] border-2 border-border shadow-sm">
            {TABS.map((t, i) => {
              const active = t.value === tab;
              const count =
                t.value === "candidates" ? exam.counts.candidates : t.value === "sittings" ? exam.sittings.length : null;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  id={`exam-tab-${t.value}`}
                  aria-selected={active}
                  aria-controls="exam-tabpanel"
                  onClick={() => goToTab(t.value)}
                  className={cn(
                    "flex min-h-10 items-center gap-1.5 px-4 py-2 text-[13px] font-bold outline-none [touch-action:manipulation] transition-colors",
                    "focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring",
                    i > 0 && "border-l-2 border-border",
                    active ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {t.label}
                  {count != null ? <span className="num opacity-75">{count}</span> : null}
                  {t.value === "overview" && problems > 0 && exam.status === "DRAFT" ? (
                    <span
                      className="num inline-flex size-5 items-center justify-center rounded-full border-2 border-current text-[10px]"
                      aria-label={`${problems} to fix before publishing`}
                    >
                      {problems}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div role="tabpanel" id="exam-tabpanel" aria-labelledby={`exam-tab-${tab}`}>
          {tab === "overview" ? <OverviewTab /> : null}
          {tab === "paper" ? <PaperTab /> : null}
          {tab === "settings" ? <SettingsTab /> : null}
          {tab === "security" ? <SecurityTab /> : null}
          {tab === "candidates" ? <CandidatesTab /> : null}
          {tab === "sittings" ? <SittingsTab /> : null}
          {tab === "preview" ? <PreviewTab /> : null}
        </div>
      </div>
    </BuilderContext.Provider>
  );
}
