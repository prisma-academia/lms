"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SelectInput, TextInput } from "@/components/form-field";
import { MathText } from "@/components/assessments/math-text";
import { allQuestionTypes, questionType } from "@/lib/assessments/types";
import type { QuestionTypeValue } from "@/lib/schemas/question";
import { DIFFICULTY_LABEL, type DifficultyValue, type ExamQuestionSummary } from "@/lib/exams/admin-dto";
import { useBuilder } from "./builder-context";

type PickerQuestion = {
  id: string;
  type: QuestionTypeValue;
  prompt: string;
  points: number;
  difficulty: DifficultyValue | null;
  inPassage: boolean;
  tags: { id: string; name: string }[];
  usedInSectionId: string | null;
};

type Result = { key: string; questions: PickerQuestion[]; truncated: boolean; error: string | null };

/**
 * Pick questions from a bank into one section: search, filter by type,
 * difficulty and tag, tick, add. Questions already in the exam are shown but
 * cannot be picked twice.
 */
export function QuestionPicker({
  open,
  onOpenChange,
  sectionId,
  sectionTitle,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionId: string;
  sectionTitle: string;
  onAdd: (questions: ExamQuestionSummary[]) => Promise<boolean>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        {open ? <PickerBody sectionId={sectionId} sectionTitle={sectionTitle} onAdd={onAdd} onClose={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function PickerBody({
  sectionId,
  sectionTitle,
  onAdd,
  onClose,
}: {
  sectionId: string;
  sectionTitle: string;
  onAdd: (questions: ExamQuestionSummary[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const { exam, banks, tags } = useBuilder();
  const [bankId, setBankId] = useState(banks[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [tagId, setTagId] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [picked, setPicked] = useState<Map<string, ExamQuestionSummary>>(new Map());
  const [adding, setAdding] = useState(false);

  const key = JSON.stringify([bankId, search.trim(), type, difficulty, tagId]);
  useEffect(() => {
    if (!bankId) return;
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ bankId, q: search.trim(), type, difficulty, tagId });
      void apiGet<{ questions: PickerQuestion[]; truncated: boolean }>(`/api/tenant/exams/${exam.id}/bank-questions?${qs}`).then((res) => {
        setResult({
          key,
          questions: res.data?.questions ?? [],
          truncated: res.data?.truncated ?? false,
          error: res.error?.message ?? null,
        });
      });
    }, 250);
    return () => clearTimeout(t);
    // `key` holds every filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, exam.id]);

  const loading = !result || result.key !== key;
  const bankName = banks.find((b) => b.id === bankId)?.name ?? "";
  const sectionTitleOf = (id: string) => exam.sections.find((s) => s.id === id)?.title ?? "another section";
  const selectable = (result?.questions ?? []).filter((q) => !q.usedInSectionId);

  function toggle(q: PickerQuestion, on: boolean) {
    setPicked((prev) => {
      const next = new Map(prev);
      if (on) next.set(q.id, { id: q.id, type: q.type, prompt: q.prompt, points: q.points, difficulty: q.difficulty, bankId, bankName });
      else next.delete(q.id);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setPicked((prev) => {
      const next = new Map(prev);
      for (const q of selectable) {
        if (on) next.set(q.id, { id: q.id, type: q.type, prompt: q.prompt, points: q.points, difficulty: q.difficulty, bankId, bankName });
        else next.delete(q.id);
      }
      return next;
    });
  }

  async function add() {
    setAdding(true);
    const ok = await onAdd([...picked.values()]);
    setAdding(false);
    if (ok) onClose();
  }

  const allOn = selectable.length > 0 && selectable.every((q) => picked.has(q.id));
  const someOn = selectable.some((q) => picked.has(q.id));

  return (
    <>
      <SheetHeader>
        <SheetTitle>Add questions to {sectionTitle}</SheetTitle>
        <SheetDescription>Tick questions from your banks. You can pick from several banks before adding.</SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-3">
        {banks.length === 0 ? (
          <EmptyState icon="folder" title="No question banks">
            Create a question bank and write some questions first. Banks are under Question banks.
          </EmptyState>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <SelectInput
                aria-label="Question bank"
                allowEmpty={false}
                options={banks.map((b) => ({ value: b.id, label: `${b.name} (${b.questionCount})` }))}
                value={bankId}
                onChange={(e) => setBankId(e.target.value)}
              />
              <TextInput type="search" aria-label="Search questions" placeholder="Search the question text…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <SelectInput
                aria-label="Filter by type"
                placeholder="All types"
                options={allQuestionTypes().map((t) => ({ value: t.type, label: t.label }))}
                value={type}
                onChange={(e) => setType(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <SelectInput
                  aria-label="Filter by difficulty"
                  placeholder="Any difficulty"
                  options={[
                    { value: "EASY", label: "Easy" },
                    { value: "MEDIUM", label: "Medium" },
                    { value: "HARD", label: "Hard" },
                    { value: "none", label: "Not set" },
                  ]}
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                />
                <SelectInput aria-label="Filter by tag" placeholder="Any tag" options={tags.map((t) => ({ value: t.id, label: t.name }))} value={tagId} onChange={(e) => setTagId(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-b-2 border-dashed border-border pb-2" aria-live="polite">
              <label className="flex items-center gap-2 text-[13px] font-bold">
                <Checkbox
                  checked={allOn ? true : someOn ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAll(v === true)}
                  disabled={loading || selectable.length === 0}
                  aria-label="Select all shown"
                />
                Select all shown
              </label>
              <span className="num text-xs font-bold text-muted-foreground">
                {loading ? "Loading…" : `${result?.questions.length ?? 0}${result?.truncated ? "+" : ""} shown`}
              </span>
            </div>

            {result?.error && !loading ? (
              <p role="alert" className="text-sm font-bold text-destructive">
                {result.error}
              </p>
            ) : null}
            {!loading && result && result.questions.length === 0 && !result.error ? (
              <EmptyState icon="search" title="No questions match">
                Try another bank or loosen the filters.
              </EmptyState>
            ) : null}

            <ul className={loading ? "flex flex-col gap-2 opacity-60" : "flex flex-col gap-2"} aria-busy={loading}>
              {(result?.questions ?? []).map((q) => {
                const usedHere = q.usedInSectionId === sectionId;
                const usedElsewhere = !!q.usedInSectionId && !usedHere;
                const id = `pick-${q.id}`;
                return (
                  <li key={q.id}>
                    <label
                      htmlFor={id}
                      className={
                        "flex items-start gap-3 rounded-[10px] border-2 border-border bg-card px-3 py-2.5 " +
                        (q.usedInSectionId ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-accent/40")
                      }
                    >
                      <Checkbox
                        id={id}
                        checked={usedHere || picked.has(q.id)}
                        disabled={!!q.usedInSectionId}
                        onCheckedChange={(v) => toggle(q, v === true)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-3 text-sm font-bold">
                          <MathText>{q.prompt || "—"}</MathText>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge>{questionType(q.type).label}</Badge>
                          {q.difficulty ? <Badge>{DIFFICULTY_LABEL[q.difficulty]}</Badge> : null}
                          <span className="num">{q.points} pt</span>
                          {q.inPassage ? <span>· passage</span> : null}
                          {q.tags.map((t) => (
                            <span key={t.id}>· #{t.name}</span>
                          ))}
                          {usedHere ? <span className="font-bold text-foreground">· already in this section</span> : null}
                          {usedElsewhere ? <span className="font-bold text-foreground">· in {sectionTitleOf(q.usedInSectionId!)}</span> : null}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {result?.truncated && !loading ? (
              <p className="text-xs font-medium text-muted-foreground">Only the first 300 are shown. Search or filter to narrow the list.</p>
            ) : null}
          </>
        )}
      </SheetBody>
      <SheetFooter className="flex items-center justify-between gap-2">
        <span className="num text-[13px] font-bold">{picked.size} selected</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={adding}>
            Cancel
          </Button>
          <Button type="button" onClick={add} disabled={adding || picked.size === 0}>
            {adding ? "Adding…" : `Add ${picked.size || ""} ${picked.size === 1 ? "question" : "questions"}`.replace("  ", " ")}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}
