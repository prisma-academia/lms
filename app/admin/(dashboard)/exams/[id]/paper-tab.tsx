"use client";

import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/client/api";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icon";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { FormField, TextArea, TextInput } from "@/components/form-field";
import { MathText } from "@/components/assessments/math-text";
import { questionType } from "@/lib/assessments/types";
import type { PoolRule } from "@/lib/exams/settings";
import { DIFFICULTY_LABEL, type ExamItemDTO, type ExamQuestionSummary, type ExamSectionDTO } from "@/lib/exams/admin-dto";
import type { PaperAvailability, PoolRuleAvailability } from "@/lib/exams/admin";
import { useBuilder } from "./builder-context";
import { Notice, SectionHeading, Stat, ToggleRow, intOrNull } from "./ui";
import { QuestionPicker } from "./question-picker";
import { PoolEditor } from "./pool-editor";

export function PaperTab() {
  const { exam, reload, setExam, canWrite, paperLocked } = useBuilder();
  const { toast } = useToast();
  const [availability, setAvailability] = useState<{ key: string; data: PaperAvailability | null; error: string | null } | null>(null);
  const [adding, setAdding] = useState(false);

  const editable = canWrite && !paperLocked;
  // Everything the availability depends on.
  const paperKey = JSON.stringify(exam.sections.map((s) => [s.id, s.items.map((i) => [i.questionId, i.points]), s.pools]));
  useEffect(() => {
    void apiGet<PaperAvailability>(`/api/tenant/exams/${exam.id}/availability`).then((res) => {
      setAvailability({ key: paperKey, data: res.data, error: res.error?.message ?? null });
    });
  }, [paperKey, exam.id]);
  const avail = availability?.key === paperKey ? availability.data : null;

  async function addSection() {
    setAdding(true);
    const res = await apiPost<{ section: ExamSectionDTO }>(`/api/tenant/exams/${exam.id}/sections`, {});
    setAdding(false);
    if (res.error) return toast(res.error.message);
    setExam((e) => ({ ...e, sections: [...e.sections, res.data!.section] }));
    void reload();
  }

  async function move(index: number, dir: -1 | 1) {
    const ids = exam.sections.map((s) => s.id);
    const t = index + dir;
    if (t < 0 || t >= ids.length) return;
    [ids[index], ids[t]] = [ids[t], ids[index]];
    setExam((e) => ({ ...e, sections: ids.map((id) => e.sections.find((s) => s.id === id)!) }));
    const res = await apiPut(`/api/tenant/exams/${exam.id}/sections/order`, { ids });
    if (res.error) toast(res.error.message);
    void reload();
  }

  const fixedPoints = exam.sections.reduce((n, s) => n + s.items.reduce((m, it) => m + (it.points ?? it.question.points), 0), 0);
  const fixedCount = exam.sections.reduce((n, s) => n + s.items.length, 0);
  const poolCount = exam.sections.reduce((n, s) => n + s.pools.reduce((m, p) => m + p.count, 0), 0);

  return (
    <div className="flex flex-col gap-5">
      {paperLocked ? (
        <Notice tone="warn" icon="lock">
          <strong>The paper is locked.</strong> Candidates have already started this exam, so its questions, sections and pools cannot change — everyone must be marked against the same paper. Settings and security can still be edited. For a revised paper, create a new exam.
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Questions per candidate" value={fixedCount + poolCount} hint={poolCount ? `${fixedCount} fixed + ${poolCount} drawn at random` : "all fixed"} />
        <Stat label="Total points" value={avail ? (poolCount ? `≈${avail.estimatedTotalPoints}` : avail.estimatedTotalPoints) : poolCount ? "…" : fixedPoints} hint={poolCount ? "random draws vary" : undefined} />
        <Stat label="Sections" value={exam.sections.length} />
      </div>

      {avail?.problems.length ? (
        <Notice tone="error">
          <p className="font-bold">The paper cannot be drawn yet:</p>
          <ul className="mt-1 list-disc pl-4">
            {avail.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {availability?.error ? <Notice tone="error">{availability.error}</Notice> : null}

      {exam.sections.map((s, i) => (
        <SectionCard
          key={s.id}
          section={s}
          index={i}
          total={exam.sections.length}
          editable={editable}
          rules={avail?.sections.find((x) => x.sectionId === s.id)?.rules ?? null}
          onMove={(dir) => move(i, dir)}
        />
      ))}

      {editable ? (
        <div>
          <Button type="button" variant="outline" onClick={addSection} disabled={adding}>
            <Icon name="plus" aria-hidden />
            {adding ? "Adding…" : "Add section"}
          </Button>
          <p className="mt-1.5 text-xs font-medium text-muted-foreground">
            Sections group questions — e.g. “Objective” and “Theory” — each with its own instructions and, if you like, its own time limit.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function describeRule(rule: PoolRule, banks: { id: string; name: string }[], tags: { id: string; name: string }[]) {
  const bank = banks.find((b) => b.id === rule.bankId)?.name ?? "a bank you cannot open";
  const parts = [rule.difficulty ? DIFFICULTY_LABEL[rule.difficulty].toLowerCase() : null];
  if (rule.types.length) {
    parts.push(
      rule.types
        .map((t) => {
          try {
            return questionType(t as never).label;
          } catch {
            return t;
          }
        })
        .join(" / ")
    );
  }
  const tagNames = rule.tagIds.map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean);
  return {
    title: `${rule.count} random ${parts.filter(Boolean).join(" ")} ${rule.count === 1 ? "question" : "questions"}`.replace(/\s+/g, " "),
    detail: `from ${bank}${tagNames.length ? ` · tagged ${tagNames.map((t) => `#${t}`).join(", ")}` : ""} · ${rule.points != null ? `${rule.points} pt each` : "own points"}`,
  };
}

function SectionCard({
  section,
  index,
  total,
  editable,
  rules,
  onMove,
}: {
  section: ExamSectionDTO;
  index: number;
  total: number;
  editable: boolean;
  rules: PoolRuleAvailability[] | null;
  onMove: (dir: -1 | 1) => void;
}) {
  const { exam, reload, setExam, banks, tags, canWrite } = useBuilder();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PoolRule | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const points = section.items.reduce((n, it) => n + (it.points ?? it.question.points), 0);
  const base = `/api/tenant/exams/${exam.id}/sections/${section.id}`;

  function patchSection(update: (s: ExamSectionDTO) => ExamSectionDTO) {
    setExam((e) => ({ ...e, sections: e.sections.map((s) => (s.id === section.id ? update(s) : s)) }));
  }

  async function saveItems(next: ExamItemDTO[]): Promise<boolean> {
    patchSection((s) => ({ ...s, items: next }));
    const res = await apiPut(`${base}/items`, { items: next.map((it) => ({ questionId: it.questionId, points: it.points })) });
    if (res.error) {
      toast(res.error.message);
      await reload();
      return false;
    }
    void reload();
    return true;
  }

  async function addQuestions(qs: ExamQuestionSummary[]) {
    const known = new Set(section.items.map((i) => i.questionId));
    const added = qs.filter((q) => !known.has(q.id)).map((q) => ({ id: `new-${q.id}`, questionId: q.id, points: null, question: q }));
    const ok = await saveItems([...section.items, ...added]);
    if (ok) toast(`${added.length} ${added.length === 1 ? "question" : "questions"} added to ${section.title}.`);
    return ok;
  }

  function moveItem(i: number, dir: -1 | 1) {
    const next = [...section.items];
    const t = i + dir;
    if (t < 0 || t >= next.length) return;
    [next[i], next[t]] = [next[t], next[i]];
    void saveItems(next);
  }

  async function savePools(next: PoolRule[]): Promise<boolean> {
    patchSection((s) => ({ ...s, pools: next }));
    const res = await apiPatch(base, { poolsJson: next });
    if (res.error) {
      toast(res.error.message);
      await reload();
      return false;
    }
    void reload();
    return true;
  }

  async function removeSection() {
    const n = section.items.length + section.pools.length;
    if (
      !(await confirm({
        title: `Delete “${section.title}”?`,
        description: n ? "Its questions and pools are removed from this exam (they stay in their banks)." : "The empty section is removed.",
        confirmLabel: "Delete section",
        destructive: true,
      }))
    )
      return;
    const res = await apiDelete(base);
    if (res.error) return toast(res.error.message);
    setExam((e) => ({ ...e, sections: e.sections.filter((s) => s.id !== section.id) }));
    void reload();
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-xs font-black uppercase text-muted-foreground">Section {index + 1}</p>
          <h2 className="font-heading text-lg leading-tight">{section.title}</h2>
          <p className="num mt-0.5 text-[13px] font-medium text-muted-foreground">
            {section.items.length} fixed · {section.pools.reduce((n, p) => n + p.count, 0)} random · {points} pt fixed
            {section.timeLimitMin ? ` · ${section.timeLimitMin} min limit` : ""}
            {section.shuffle && exam.shuffleQuestions ? " · shuffled" : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {canWrite ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setDetailsOpen((o) => !o)} aria-expanded={detailsOpen}>
              <Icon name="settings" aria-hidden />
              Section settings
            </Button>
          ) : null}
          {editable ? (
            <>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${section.title} up`}>
                <Icon name="chevron-up" aria-hidden />
              </Button>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`Move ${section.title} down`}>
                <Icon name="chevron-down" aria-hidden />
              </Button>
              <Button type="button" variant="outline" size="icon-sm" onClick={removeSection} disabled={total <= 1} aria-label={`Delete ${section.title}`}>
                <Icon name="trash" aria-hidden />
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {section.instructions ? (
        <div className="mt-3 rounded-[10px] border-2 border-dashed border-border bg-background px-3 py-2 text-[13px]">
          <MathText as="div">{section.instructions}</MathText>
        </div>
      ) : null}

      {detailsOpen ? <SectionDetails section={section} paperEditable={editable} onDone={() => setDetailsOpen(false)} /> : null}

      <div className="mt-4">
        <SectionHeading
          title="Questions"
          action={
            editable ? (
              <Button type="button" size="sm" onClick={() => setPickerOpen(true)}>
                <Icon name="plus" aria-hidden />
                Add from banks
              </Button>
            ) : undefined
          }
        />
        {section.items.length === 0 ? (
          <p className="rounded-[10px] border-2 border-dashed border-border px-3 py-4 text-center text-[13px] font-medium text-muted-foreground">
            No fixed questions. Add some from your banks, or use a random pool below.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {section.items.map((it, i) => (
              <ItemRow
                key={it.questionId}
                item={it}
                n={i + 1}
                editable={editable}
                first={i === 0}
                last={i === section.items.length - 1}
                onMove={(dir) => moveItem(i, dir)}
                onPoints={(p) => saveItems(section.items.map((x) => (x.questionId === it.questionId ? { ...x, points: p } : x)))}
                onRemove={() => saveItems(section.items.filter((x) => x.questionId !== it.questionId))}
              />
            ))}
          </ol>
        )}
      </div>

      <div className="mt-5 border-t-2 border-dashed border-border pt-4">
        <SectionHeading
          title="Random pools"
          action={
            editable ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingRule(null);
                  setPoolOpen(true);
                }}
              >
                <Icon name="refresh" aria-hidden />
                Add random pool
              </Button>
            ) : undefined
          }
        >
          Each candidate gets a different random draw. Good against copying from a neighbour.
        </SectionHeading>
        {section.pools.length === 0 ? null : (
          <ul className="flex flex-col gap-2">
            {section.pools.map((rule) => {
              const d = describeRule(rule, banks, tags);
              const a = rules?.find((r) => r.id === rule.id);
              return (
                <li key={rule.id} className="flex flex-wrap items-center gap-3 rounded-[10px] border-2 border-border bg-background px-3 py-2.5">
                  <Icon name="refresh" className="size-4 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-sm font-bold">{d.title}</p>
                    <p className="text-xs font-medium text-muted-foreground">{d.detail}</p>
                  </div>
                  {a ? (
                    <Badge color={a.ok ? "var(--success)" : "var(--destructive)"}>
                      {a.ok ? `${a.available} available` : `Only ${a.available} available`}
                    </Badge>
                  ) : (
                    <Badge>Checking…</Badge>
                  )}
                  {editable ? (
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setEditingRule(rule);
                          setPoolOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        aria-label="Remove this pool"
                        onClick={() => void savePools(section.pools.filter((p) => p.id !== rule.id))}
                      >
                        <Icon name="x" aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editable ? (
        <>
          <QuestionPicker open={pickerOpen} onOpenChange={setPickerOpen} sectionId={section.id} sectionTitle={section.title} onAdd={addQuestions} />
          <PoolEditor
            open={poolOpen}
            onOpenChange={setPoolOpen}
            rule={editingRule}
            onSave={(rule) =>
              savePools(
                section.pools.some((p) => p.id === rule.id) ? section.pools.map((p) => (p.id === rule.id ? rule : p)) : [...section.pools, rule]
              )
            }
          />
        </>
      ) : null}
    </Card>
  );
}

function ItemRow({
  item,
  n,
  editable,
  first,
  last,
  onMove,
  onPoints,
  onRemove,
}: {
  item: ExamItemDTO;
  n: number;
  editable: boolean;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onPoints: (points: number | null) => void;
  onRemove: () => void;
}) {
  const [points, setPoints] = useState(item.points != null ? String(item.points) : "");
  const [seen, setSeen] = useState(item.points);
  // Follow the server when it changes underneath (e.g. after a reload).
  if (seen !== item.points) {
    setSeen(item.points);
    setPoints(item.points != null ? String(item.points) : "");
  }
  const id = `item-points-${item.questionId}`;
  const q = item.question;

  function commit() {
    const v = intOrNull(points);
    if (points.trim() && (v == null || v < 0 || v > 1000)) {
      setPoints(item.points != null ? String(item.points) : "");
      return;
    }
    const next = v === q.points ? null : v;
    if (next !== item.points) onPoints(next);
  }

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[10px] border-2 border-border bg-card px-3 py-2.5">
      <span className="num mt-0.5 w-6 shrink-0 text-sm font-black text-muted-foreground">{n}.</span>
      <div className="min-w-0 flex-1 basis-56">
        <div className="line-clamp-2 text-sm font-bold">
          <MathText>{q.prompt || "—"}</MathText>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge>{questionType(q.type).label}</Badge>
          {q.difficulty ? <Badge>{DIFFICULTY_LABEL[q.difficulty]}</Badge> : null}
          <span>{q.bankName}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <label htmlFor={id} className="text-xs font-bold text-muted-foreground">
          Points
        </label>
        <TextInput
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={1000}
          className="h-9 w-20 px-2 py-1 text-sm"
          placeholder={String(q.points)}
          value={points}
          disabled={!editable}
          onChange={(e) => setPoints(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-describedby={`${id}-hint`}
        />
        <span id={`${id}-hint`} className="sr-only">
          Leave empty to use the question&apos;s own {q.points} points.
        </span>
        {editable ? (
          <>
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => onMove(-1)} disabled={first} aria-label={`Move question ${n} up`}>
              <Icon name="chevron-up" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => onMove(1)} disabled={last} aria-label={`Move question ${n} down`}>
              <Icon name="chevron-down" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon-xs" onClick={onRemove} aria-label={`Remove question ${n}`}>
              <Icon name="x" aria-hidden />
            </Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

function SectionDetails({ section, paperEditable, onDone }: { section: ExamSectionDTO; paperEditable: boolean; onDone: () => void }) {
  const { exam, reload } = useBuilder();
  const { toast } = useToast();
  const [title, setTitle] = useState(section.title);
  const [instructions, setInstructions] = useState(section.instructions ?? "");
  const [timeLimit, setTimeLimit] = useState(section.timeLimitMin != null ? String(section.timeLimitMin) : "");
  const [shuffle, setShuffle] = useState(section.shuffle);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const uid = `sec-${section.id}`;

  async function save() {
    if (!title.trim()) return setError("Give the section a title.");
    const limit = intOrNull(timeLimit);
    if (timeLimit.trim() && (limit == null || limit < 1 || limit > 1440)) return setError("The time limit is a whole number of minutes, 1 or more.");
    setError(null);
    setSaving(true);
    const body: Record<string, unknown> = { title: title.trim(), instructions: instructions.trim() || null };
    if (paperEditable) {
      body.timeLimitMin = limit;
      body.shuffle = shuffle;
    }
    const res = await apiPatch(`/api/tenant/exams/${exam.id}/sections/${section.id}`, body);
    setSaving(false);
    if (res.error) return setError(res.error.message);
    toast("Section saved.");
    await reload();
    onDone();
  }

  return (
    <div className="mt-4 grid gap-4 rounded-[12px] border-2 border-border bg-background p-4">
      <FormField label="Section title" htmlFor={`${uid}-title`}>
        <TextInput id={`${uid}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </FormField>
      <FormField label="Instructions (optional)" htmlFor={`${uid}-instr`} hint="Shown at the start of the section. Plain text; maths between $ signs is rendered.">
        <TextArea id={`${uid}-instr`} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={5000} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Section time limit (minutes, optional)"
          htmlFor={`${uid}-limit`}
          hint={paperEditable ? "When it runs out the section locks and the candidate moves on." : "Locked: candidates have started."}
        >
          <TextInput id={`${uid}-limit`} type="number" inputMode="numeric" min={1} value={timeLimit} disabled={!paperEditable} onChange={(e) => setTimeLimit(e.target.value)} />
        </FormField>
        <div className="flex flex-col justify-end">
          <ToggleRow
            id={`${uid}-shuffle`}
            label="Shuffle questions in this section"
            description={exam.shuffleQuestions ? "Each candidate sees them in a different order." : "Question shuffling is off for the whole exam (Settings)."}
            checked={shuffle}
            onChange={setShuffle}
            disabled={!paperEditable}
          />
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save section"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

