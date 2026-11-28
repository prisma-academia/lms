"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import type { QuestionDifficultyValue, QuestionTypeValue } from "@/lib/schemas/question";
import type { EssayRubric, RubricCriterion } from "@/lib/schemas/essay-grading";
import {
  allQuestionTypes,
  blankIdsInPrompt,
  candidateView,
  gradeQuestion,
  questionType,
  validateAuthoring,
  type HotspotRegion,
} from "@/lib/assessments/types";
import { QuestionPlayer, type Media } from "@/components/assessments/question-player";
import { MathText, TexPreview } from "@/components/assessments/math-text";
import { uploadQuestionAsset } from "@/components/assessments/upload-asset";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * The question authoring workspace: every type, a live candidate preview and a
 * "check my answer" button that runs the real grader in the browser.
 *
 * It edits the registry's stored shapes (`options` / `answer`) directly, so
 * what is previewed is exactly what will be graded.
 */

export type EditorQuestion = {
  id?: string;
  type: QuestionTypeValue;
  prompt: string;
  options: unknown;
  answer: unknown;
  rubric: EssayRubric | null;
  points: number;
  tagIds: string[];
  hint: string | null;
  difficulty: QuestionDifficultyValue | null;
  explanation: string | null;
  negativePoints: number | null;
  partialCredit: boolean;
  media: Media | null;
  groupId: string | null;
};

export type EditorPayload = Omit<EditorQuestion, "id" | "media"> & { media: Media | null };

type Tag = { id: string; name: string };
type Passage = { id: string; title: string | null };

const FAMILY_LABEL: Record<string, string> = {
  choice: "Choice",
  text: "Typed answers",
  interactive: "Interactive",
  media: "Uploads & recordings",
};

export function blankQuestion(type: QuestionTypeValue = "SINGLE_CHOICE"): EditorQuestion {
  const d = questionType(type).defaults();
  return {
    type,
    prompt: type === "FILL_BLANKS" ? "The capital of France is [[1]]." : "",
    options: structuredClone(d.options),
    answer: structuredClone(d.answer),
    rubric: type === "ESSAY" ? blankRubric() : null,
    points: 1,
    tagIds: [],
    hint: null,
    difficulty: null,
    explanation: null,
    negativePoints: null,
    partialCredit: false,
    media: null,
    groupId: null,
  };
}

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function blankCriterion(): RubricCriterion {
  return { id: newId("c"), label: "", description: "", weight: 1 };
}

function blankRubric(): EssayRubric {
  return { criteria: [blankCriterion()], modelAnswer: null, minWords: null, maxWords: null };
}

export function QuestionEditor({
  initial,
  tags,
  passages = [],
  examContext = false,
  onCreateTag,
  onSave,
  onCancel,
  saving,
}: {
  initial: EditorQuestion;
  tags: Tag[];
  passages?: Passage[];
  /** Exam banks may hold staff-marked types; quiz-only use hides them. */
  examContext?: boolean;
  onCreateTag?: (name: string) => Promise<Tag | null>;
  onSave: (payload: EditorPayload) => Promise<string | null>;
  onCancel: () => void;
  saving?: boolean;
}) {
  const [q, setQ] = useState<EditorQuestion>(() => structuredClone(initial));
  const [error, setError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const def = questionType(q.type);
  const set = (patch: Partial<EditorQuestion>) => setQ((prev) => ({ ...prev, ...patch }));

  function changeType(type: QuestionTypeValue) {
    if (type === q.type) return;
    const fresh = blankQuestion(type);
    setQ((prev) => ({
      ...fresh,
      prompt: prev.prompt && !(type === "FILL_BLANKS" && !prev.prompt.includes("[[")) ? prev.prompt : fresh.prompt,
      points: prev.points,
      tagIds: prev.tagIds,
      hint: prev.hint,
      difficulty: prev.difficulty,
      explanation: prev.explanation,
      media: prev.media,
      groupId: prev.groupId,
      negativePoints: prev.negativePoints,
      id: prev.id,
    }));
    setError(null);
  }

  const validation = useMemo(() => {
    if (!q.prompt.trim()) return "Write the question.";
    if (q.type === "ESSAY") {
      const r = q.rubric;
      if (!r || r.criteria.length === 0) return "Add at least one rubric criterion.";
      if (r.criteria.some((c) => !c.label.trim())) return "Every rubric criterion needs a label.";
      return null;
    }
    const res = validateAuthoring(q.type, { prompt: q.prompt, options: q.options, answer: q.answer });
    return res.ok ? null : res.message;
  }, [q]);

  async function save() {
    setError(null);
    if (validation) return setError(validation);
    const msg = await onSave({
      type: q.type,
      prompt: q.prompt.trim(),
      options: q.options,
      answer: q.answer,
      rubric: q.type === "ESSAY" ? q.rubric : null,
      points: q.points,
      tagIds: q.tagIds,
      hint: q.hint?.trim() || null,
      difficulty: q.difficulty,
      explanation: q.explanation?.trim() || null,
      negativePoints: q.negativePoints,
      partialCredit: def.supportsPartialCredit ? q.partialCredit : false,
      media: q.media,
      groupId: q.groupId,
    });
    if (msg) setError(msg);
  }

  const families = ["choice", "text", "interactive", "media"] as const;
  const types = allQuestionTypes().filter((t) => examContext || !t.examOnly);

  return (
    <div className="flex flex-col gap-5">
      {/* Type picker */}
      <section aria-labelledby="qe-type">
        <h3 id="qe-type" className="text-[13px] font-black uppercase tracking-wide text-muted-foreground">
          Question type
        </h3>
        <div className="mt-2 flex flex-col gap-3">
          {families.map((family) => {
            const inFamily = types.filter((t) => t.family === family);
            if (inFamily.length === 0) return null;
            return (
              <div key={family}>
                <div className="mb-1.5 text-xs font-bold text-muted-foreground">{FAMILY_LABEL[family]}</div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {inFamily.map((t) => (
                    <button
                      key={t.type}
                      type="button"
                      aria-pressed={q.type === t.type}
                      onClick={() => changeType(t.type)}
                      className={cn(
                        "flex flex-col items-start gap-0.5 rounded-[10px] border-2 px-3 py-2 text-left outline-none focus-visible:outline-[3px] focus-visible:outline-ring",
                        q.type === t.type ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-black">
                        {t.label}
                        {t.grading !== "auto" ? (
                          <Badge className="text-[10px]">{t.grading === "ai" ? "AI + staff" : "Staff marked"}</Badge>
                        ) : null}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">{t.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="lg:hidden">
        <Segmented
          ariaLabel="Editor view"
          options={[
            { value: "edit", label: "Edit" },
            { value: "preview", label: "Preview" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className={cn("flex flex-col gap-4", tab === "preview" && "hidden lg:flex")}>
          <PromptField q={q} set={set} />
          <MediaField media={q.media} onChange={(media) => set({ media })} />
          <TypeEditor q={q} set={set} />

          <details className="rounded-[10px] border-2 border-border bg-background p-3" open>
            <summary className="cursor-pointer text-sm font-black">Marks, difficulty & feedback</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FormField label="Points" htmlFor="qe-points">
                <TextInput
                  id="qe-points"
                  type="number"
                  min={0}
                  max={1000}
                  value={q.points}
                  onChange={(e) => set({ points: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                />
              </FormField>
              <FormField label="Difficulty" htmlFor="qe-diff">
                <SelectInput
                  id="qe-diff"
                  placeholder="Not set"
                  options={[
                    { value: "EASY", label: "Easy" },
                    { value: "MEDIUM", label: "Medium" },
                    { value: "HARD", label: "Hard" },
                  ]}
                  value={q.difficulty ?? ""}
                  onChange={(e) => set({ difficulty: (e.target.value || null) as QuestionDifficultyValue | null })}
                />
              </FormField>
              <FormField
                label="Negative marking (points lost if wrong)"
                htmlFor="qe-neg"
                hint="Leave empty to use the exam's setting. Only applies in exams with negative marking on."
              >
                <TextInput
                  id="qe-neg"
                  type="number"
                  min={0}
                  step="0.25"
                  value={q.negativePoints ?? ""}
                  onChange={(e) => set({ negativePoints: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                />
              </FormField>
              {def.supportsPartialCredit && def.grading === "auto" ? (
                <label className="flex items-start gap-2 self-end rounded-[10px] border-2 border-border bg-card p-3 text-sm font-bold">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[var(--primary)]"
                    checked={q.partialCredit}
                    onChange={(e) => set({ partialCredit: e.target.checked })}
                  />
                  <span>
                    Partial credit
                    <span className="block text-xs font-medium text-muted-foreground">
                      Award marks for each part answered correctly instead of all-or-nothing.
                    </span>
                  </span>
                </label>
              ) : null}
              {passages.length > 0 ? (
                <FormField label="Passage / shared stimulus" htmlFor="qe-group" hint="Shown beside this question in the exam.">
                  <SelectInput
                    id="qe-group"
                    placeholder="None"
                    options={passages.map((p) => ({ value: p.id, label: p.title || "Untitled passage" }))}
                    value={q.groupId ?? ""}
                    onChange={(e) => set({ groupId: e.target.value || null })}
                  />
                </FormField>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3">
              <FormField
                label="Explanation (shown after results are released)"
                htmlFor="qe-expl"
                hint="Why the answer is right. Supports $maths$."
              >
                <TextArea
                  id="qe-expl"
                  className="min-h-16"
                  maxLength={4000}
                  value={q.explanation ?? ""}
                  onChange={(e) => set({ explanation: e.target.value })}
                />
              </FormField>
              <FormField label="Hint (quizzes only, on request)" htmlFor="qe-hint">
                <TextArea
                  id="qe-hint"
                  className="min-h-14"
                  maxLength={500}
                  value={q.hint ?? ""}
                  onChange={(e) => set({ hint: e.target.value })}
                />
              </FormField>
            </div>
          </details>

          <div>
            <span className="text-[13px] font-bold text-foreground">Tags</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((t) => {
                const on = q.tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ tagIds: on ? q.tagIds.filter((x) => x !== t.id) : [...q.tagIds, t.id] })}
                    className={cn(
                      "min-h-8 rounded-full border-2 border-border px-2.5 py-0.5 text-xs font-bold outline-none focus-visible:outline-[3px] focus-visible:outline-ring",
                      on ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
                    )}
                  >
                    {on ? "✓ " : ""}
                    {t.name}
                  </button>
                );
              })}
            </div>
            {onCreateTag ? (
              <div className="mt-2 flex items-center gap-2">
                <TextInput
                  aria-label="New tag name"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="New tag…"
                  className="max-w-48"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && newTag.trim()) {
                      e.preventDefault();
                      const tag = await onCreateTag(newTag.trim());
                      if (tag) set({ tagIds: [...q.tagIds, tag.id] });
                      setNewTag("");
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!newTag.trim()) return;
                    const tag = await onCreateTag(newTag.trim());
                    if (tag) set({ tagIds: [...q.tagIds, tag.id] });
                    setNewTag("");
                  }}
                >
                  Add tag
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <aside className={cn("lg:sticky lg:top-4 lg:self-start", tab === "edit" && "hidden lg:block")}>
          <PreviewPane q={q} problem={validation} />
        </aside>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t-2 border-border pt-4">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save question"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {validation ? <span className="text-xs font-bold text-muted-foreground">To save: {validation}</span> : null}
      </div>
    </div>
  );
}

/* ───────────────────────────── prompt & media ───────────────────────────── */

function PromptField({ q, set }: { q: EditorQuestion; set: (p: Partial<EditorQuestion>) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (snippet: string) => {
    const el = ref.current;
    const at = el?.selectionStart ?? q.prompt.length;
    const end = el?.selectionEnd ?? at;
    set({ prompt: q.prompt.slice(0, at) + snippet + q.prompt.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + snippet.length, at + snippet.length);
    });
  };
  const nextBlank = () => {
    const ids = blankIdsInPrompt(q.prompt).map(Number).filter(Number.isFinite);
    return String((ids.length ? Math.max(...ids) : 0) + 1);
  };
  return (
    <FormField
      label="Question"
      htmlFor="qe-prompt"
      hint={
        q.type === "FILL_BLANKS"
          ? "Write the sentence and put each gap as [[1]], [[2]] … Maths: $x^2$ inline, $$\\frac{a}{b}$$ on its own line."
          : "Maths: $x^2$ inline, $$\\frac{a}{b}$$ on its own line."
      }
    >
      <div className="mb-1.5 flex flex-wrap gap-1">
        {q.type === "FILL_BLANKS" ? (
          <Button type="button" size="sm" variant="outline" onClick={() => insert(`[[${nextBlank()}]]`)}>
            + Insert blank
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={() => insert("$$")}>
          $ maths $
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => insert("$\\frac{}{}$")}>
          fraction
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => insert("$\\sqrt{}$")}>
          √
        </Button>
      </div>
      <textarea
        id="qe-prompt"
        ref={ref}
        className="min-h-28 w-full resize-y rounded-[10px] border-2 border-border bg-card px-3.5 py-2.5 text-[16px] font-medium leading-relaxed text-card-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        maxLength={5000}
        value={q.prompt}
        onChange={(e) => set({ prompt: e.target.value })}
        placeholder="Write the question as the candidate will read it."
      />
    </FormField>
  );
}

function MediaField({ media, onChange }: { media: Media | null; onChange: (m: Media | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  return (
    <details className="rounded-[10px] border-2 border-border bg-background p-3" open={!!media}>
      <summary className="cursor-pointer text-sm font-black">Picture, audio or video (optional)</summary>
      <div className="mt-3 flex flex-col gap-2">
        {media ? (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-bold text-muted-foreground">
              {media.kind} · <span className="break-all">{media.url}</span>
            </div>
            {media.kind === "audio" ? (
              <FormField label="Times the candidate may play it" htmlFor="qe-plays" hint="Empty = unlimited.">
                <TextInput
                  id="qe-plays"
                  type="number"
                  min={1}
                  max={10}
                  className="max-w-28"
                  value={media.maxPlays ?? ""}
                  onChange={(e) => onChange({ ...media, maxPlays: e.target.value ? Math.max(1, parseInt(e.target.value, 10)) : null })}
                />
              </FormField>
            ) : null}
            {media.kind === "image" ? (
              <FormField label="Alt text" htmlFor="qe-alt" hint="Describes the image for screen readers.">
                <TextInput id="qe-alt" value={media.alt ?? ""} onChange={(e) => onChange({ ...media, alt: e.target.value })} />
              </FormField>
            ) : null}
            <div>
              <Button type="button" size="sm" variant="destructive" onClick={() => onChange(null)}>
                Remove media
              </Button>
            </div>
          </div>
        ) : (
          <>
            <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-[10px] border-2 border-border bg-card px-3 py-2 text-sm font-bold hover:bg-muted">
              <Icon name="upload" className="size-4" /> {busy ? "Uploading…" : "Upload a file"}
              <input
                type="file"
                className="sr-only"
                accept="image/png,image/jpeg,image/webp,image/gif,audio/*,video/mp4,video/webm"
                disabled={busy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setBusy(true);
                  setError(null);
                  const r = await uploadQuestionAsset(f);
                  setBusy(false);
                  if ("error" in r) return setError(r.error);
                  const kind = f.type.startsWith("audio/") ? "audio" : f.type.startsWith("video/") ? "video" : "image";
                  onChange({ kind, url: r.url, maxPlays: null, alt: null });
                }}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                aria-label="Or paste a link"
                placeholder="…or paste an https:// link"
                className="max-w-md"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!/^https:\/\//.test(url)) return setError("Use an https:// link.");
                  const kind = /\.(mp3|wav|m4a|ogg|aac|weba)(\?|$)/i.test(url)
                    ? "audio"
                    : /\.(mp4|webm|mov)(\?|$)/i.test(url)
                      ? "video"
                      : "image";
                  onChange({ kind, url, maxPlays: null, alt: null });
                  setUrl("");
                }}
              >
                Use link
              </Button>
            </div>
          </>
        )}
        {error ? (
          <p role="alert" className="text-xs font-bold text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}

/* ───────────────────────────── preview ───────────────────────────── */

function PreviewPane({ q, problem }: { q: EditorQuestion; problem: string | null }) {
  const [response, setResponse] = useState<unknown>(undefined);
  const [checked, setChecked] = useState<null | { text: string; tone: "ok" | "bad" | "info" }>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const view = useMemo(() => {
    try {
      const base = candidateView(
        { id: "preview", type: q.type, prompt: q.prompt, optionsJson: q.options, answerJson: q.answer },
        seed
      ) as Record<string, unknown>;
      return q.type === "ESSAY" ? { ...base, minWords: q.rubric?.minWords, maxWords: q.rubric?.maxWords } : base;
    } catch {
      return {};
    }
  }, [q, seed]);

  function check() {
    const g = gradeQuestion(
      { type: q.type, prompt: q.prompt, optionsJson: q.options, answerJson: q.answer, partialCredit: q.partialCredit },
      response
    );
    if (!g.answered) return setChecked({ text: "No answer given yet.", tone: "info" });
    if (g.fraction === null) {
      return setChecked({ text: "Answered. This type is marked by a person (or the AI grader for essays).", tone: "info" });
    }
    const pts = Math.round(g.fraction * q.points * 100) / 100;
    setChecked({
      text: g.fraction >= 1 ? `Correct — ${pts} / ${q.points} points.` : `${pts} / ${q.points} points.`,
      tone: g.fraction >= 1 ? "ok" : "bad",
    });
  }

  return (
    <div className="rounded-[14px] border-2 border-border bg-background p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-black uppercase tracking-wide text-muted-foreground">Candidate preview</span>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSeed(Math.floor(Math.random() * 1e9));
              setResponse(undefined);
              setChecked(null);
            }}
          >
            Shuffle
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setResponse(undefined);
              setChecked(null);
            }}
          >
            Reset
          </Button>
        </div>
      </div>
      {problem ? (
        <p className="mb-3 rounded-[8px] bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">Incomplete: {problem}</p>
      ) : null}
      <QuestionPlayer
        question={{ id: "preview", type: q.type, prompt: q.prompt || "Your question appears here.", view, media: q.media }}
        value={response}
        onChange={(v) => {
          setResponse(v);
          setChecked(null);
        }}
        eliminator
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={check}>
          Check my answer
        </Button>
        {checked ? (
          <span
            role="status"
            className={cn(
              "text-sm font-bold",
              checked.tone === "ok" ? "text-[var(--success)]" : checked.tone === "bad" ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {checked.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────────────────────── type editors ───────────────────────────── */

type SetQ = (p: Partial<EditorQuestion>) => void;

function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-2">{children}</div>;
}

function IconBtn({ label, onClick, icon, disabled }: { label: string; onClick: () => void; icon: "x" | "chevron-up" | "chevron-down"; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 shrink-0 place-items-center rounded-[8px] border-2 border-border bg-card outline-none hover:bg-muted disabled:opacity-40 focus-visible:outline-[3px] focus-visible:outline-ring"
    >
      <Icon name={icon} className="size-4" />
    </button>
  );
}

function StringList({
  label,
  values,
  onChange,
  placeholder,
  min = 1,
  max = 26,
  reorder,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: (i: number) => string;
  min?: number;
  max?: number;
  reorder?: boolean;
  hint?: string;
}) {
  const move = (i: number, j: number) => {
    const next = [...values];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[13px] font-bold">{label}</legend>
      {hint ? <p className="-mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      {values.map((v, i) => (
        <Row key={i}>
          <TextInput
            aria-label={`${label} ${i + 1}`}
            value={v}
            maxLength={1000}
            placeholder={placeholder?.(i)}
            onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {reorder ? (
            <>
              <IconBtn label="Move up" icon="chevron-up" disabled={i === 0} onClick={() => move(i, i - 1)} />
              <IconBtn label="Move down" icon="chevron-down" disabled={i === values.length - 1} onClick={() => move(i, i + 1)} />
            </>
          ) : null}
          <IconBtn label="Remove" icon="x" disabled={values.length <= min} onClick={() => onChange(values.filter((_, j) => j !== i))} />
        </Row>
      ))}
      {values.length < max ? (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ""])}>
            Add
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

function TypeEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  switch (q.type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE":
      return <ChoiceEditor q={q} set={set} />;
    case "TRUE_FALSE":
      return <TrueFalseEditor q={q} set={set} />;
    case "SHORT_ANSWER":
      return <ShortAnswerEditor q={q} set={set} />;
    case "ESSAY":
      return <EssayEditor q={q} set={set} />;
    case "FILL_BLANKS":
      return <FillBlanksEditor q={q} set={set} />;
    case "NUMERIC":
      return <NumericEditor q={q} set={set} />;
    case "MATCHING":
      return <MatchingEditor q={q} set={set} />;
    case "ORDERING":
      return <OrderingEditor q={q} set={set} />;
    case "CATEGORIZE":
      return <CategorizeEditor q={q} set={set} />;
    case "HOTSPOT":
      return <HotspotEditor q={q} set={set} />;
    case "MATRIX":
      return <MatrixEditor q={q} set={set} />;
    case "EQUATION":
      return <EquationEditor q={q} set={set} />;
    case "FILE_UPLOAD":
      return <FileUploadEditor q={q} set={set} />;
    case "AUDIO_RESPONSE":
      return <AudioEditor q={q} set={set} />;
    case "CODE":
      return <CodeEditorFields q={q} set={set} />;
  }
}

function arr<T>(v: unknown, fallback: T[]): T[] {
  return Array.isArray(v) ? (v as T[]) : fallback;
}
function obj<T extends object>(v: unknown, fallback: T): T {
  return v && typeof v === "object" && !Array.isArray(v) ? { ...fallback, ...(v as T) } : fallback;
}

function ChoiceEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const options = arr<string>(q.options, ["", ""]);
  const answer = arr<number>(q.answer, []);
  const multiple = q.type === "MULTIPLE_CHOICE";
  const toggle = (i: number) => {
    if (multiple) set({ answer: answer.includes(i) ? answer.filter((x) => x !== i) : [...answer, i].sort((a, b) => a - b) });
    else set({ answer: [i] });
  };
  const remove = (i: number) =>
    set({
      options: options.filter((_, j) => j !== i),
      answer: answer.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)),
    });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[13px] font-bold">Options — mark {multiple ? "every correct one" : "the correct one"}</legend>
      {options.map((o, i) => (
        <Row key={i}>
          <button
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={answer.includes(i)}
            aria-label={`Option ${i + 1} is correct`}
            onClick={() => toggle(i)}
            className={cn(
              "grid size-10 shrink-0 place-items-center border-2 text-sm font-black outline-none focus-visible:outline-[3px] focus-visible:outline-ring",
              multiple ? "rounded-[8px]" : "rounded-full",
              answer.includes(i) ? "border-[var(--success)] bg-[var(--success)] text-white" : "border-border bg-card"
            )}
          >
            {answer.includes(i) ? "✓" : String.fromCharCode(65 + i)}
          </button>
          <TextInput
            aria-label={`Option ${i + 1}`}
            value={o}
            maxLength={1000}
            onChange={(e) => set({ options: options.map((x, j) => (j === i ? e.target.value : x)) })}
            placeholder={`Option ${String.fromCharCode(65 + i)}`}
          />
          <IconBtn label="Remove option" icon="x" disabled={options.length <= 2} onClick={() => remove(i)} />
        </Row>
      ))}
      {options.length < 26 ? (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => set({ options: [...options, ""] })}>
            Add option
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

function TrueFalseEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const answer = arr<number>(q.answer, [0]);
  return (
    <FormField label="The statement is…" htmlFor="qe-tf">
      <Segmented
        ariaLabel="Correct answer"
        options={[
          { value: "0", label: "True" },
          { value: "1", label: "False" },
        ]}
        value={String(answer[0] ?? 0) as "0" | "1"}
        onChange={(v) => set({ options: ["True", "False"], answer: [Number(v)] })}
      />
    </FormField>
  );
}

function ShortAnswerEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const answer = arr<string>(q.answer, [""]);
  const o = obj(q.options, { caseSensitive: false, mode: "exact" as "exact" | "contains" | "wildcard", maxLength: 300 });
  return (
    <div className="flex flex-col gap-3">
      <StringList
        label="Accepted answers"
        hint="Any one of these is correct. Spacing never matters."
        values={answer.length ? answer : [""]}
        onChange={(v) => set({ answer: v })}
        placeholder={() => "An accepted answer"}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Matching" htmlFor="qe-sa-mode">
          <SelectInput
            id="qe-sa-mode"
            allowEmpty={false}
            options={[
              { value: "exact", label: "Exactly one of the answers" },
              { value: "contains", label: "Contains one of the answers" },
              { value: "wildcard", label: "Pattern (* matches anything)" },
            ]}
            value={o.mode}
            onChange={(e) => set({ options: { ...o, mode: e.target.value } })}
          />
        </FormField>
        <label className="flex items-center gap-2 self-end text-sm font-bold">
          <input
            type="checkbox"
            className="size-4"
            checked={o.caseSensitive}
            onChange={(e) => set({ options: { ...o, caseSensitive: e.target.checked } })}
          />
          Case-sensitive
        </label>
      </div>
    </div>
  );
}

function EssayEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const r = q.rubric ?? blankRubric();
  const update = (patch: Partial<EssayRubric>) => set({ rubric: { ...r, ...patch } });
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border-2 border-border bg-background p-3">
      <div className="text-sm font-black">Marking rubric</div>
      {r.criteria.map((c, i) => (
        <div key={c.id} className="grid gap-2 rounded-[8px] border-2 border-border bg-card p-2.5 sm:grid-cols-[1fr_90px_auto]">
          <TextInput
            aria-label={`Criterion ${i + 1} label`}
            value={c.label}
            maxLength={120}
            placeholder="Criterion, e.g. Explains the cause"
            onChange={(e) => update({ criteria: r.criteria.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)) })}
          />
          <TextInput
            aria-label={`Criterion ${i + 1} weight`}
            type="number"
            min={1}
            max={100}
            value={c.weight}
            onChange={(e) =>
              update({ criteria: r.criteria.map((x) => (x.id === c.id ? { ...x, weight: Math.max(1, parseInt(e.target.value, 10) || 1) } : x)) })
            }
          />
          <IconBtn
            label="Remove criterion"
            icon="x"
            disabled={r.criteria.length <= 1}
            onClick={() => update({ criteria: r.criteria.filter((x) => x.id !== c.id) })}
          />
          <TextArea
            aria-label={`Criterion ${i + 1} description`}
            className="min-h-14 sm:col-span-3"
            maxLength={1000}
            placeholder="What earns full marks"
            value={c.description}
            onChange={(e) => update({ criteria: r.criteria.map((x) => (x.id === c.id ? { ...x, description: e.target.value } : x)) })}
          />
        </div>
      ))}
      {r.criteria.length < 8 ? (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => update({ criteria: [...r.criteria, blankCriterion()] })}>
            Add criterion
          </Button>
        </div>
      ) : null}
      <FormField label="Model answer (optional)" htmlFor="qe-model">
        <TextArea id="qe-model" maxLength={8000} value={r.modelAnswer ?? ""} onChange={(e) => update({ modelAnswer: e.target.value || null })} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Min words" htmlFor="qe-min">
          <TextInput id="qe-min" type="number" min={0} value={r.minWords ?? ""} onChange={(e) => update({ minWords: e.target.value ? parseInt(e.target.value, 10) : null })} />
        </FormField>
        <FormField label="Max words" htmlFor="qe-max">
          <TextInput id="qe-max" type="number" min={1} value={r.maxWords ?? ""} onChange={(e) => update({ maxWords: e.target.value ? parseInt(e.target.value, 10) : null })} />
        </FormField>
      </div>
    </div>
  );
}

function FillBlanksEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const ids = blankIdsInPrompt(q.prompt);
  const o = obj(q.options, { blanks: [] as { id: string; choices: string[] | null }[], caseSensitive: false });
  const answer = obj(q.answer, {} as Record<string, string[]>);
  const blankOf = (id: string) => o.blanks.find((b) => b.id === id) ?? { id, choices: null };
  const writeBlank = (id: string, patch: Partial<{ choices: string[] | null }>) => {
    const others = o.blanks.filter((b) => b.id !== id && ids.includes(b.id));
    const merged = { ...blankOf(id), ...patch };
    const ordered = ids.map((x) => (x === id ? merged : others.find((b) => b.id === x) ?? { id: x, choices: null }));
    set({ options: { ...o, blanks: ordered } });
  };
  if (ids.length === 0) {
    return <p className="rounded-[8px] bg-muted px-3 py-2 text-sm font-bold">Add a blank to the question with “+ Insert blank”.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {ids.map((id, n) => {
        const b = blankOf(id);
        const accepted = answer[id] ?? [""];
        return (
          <div key={id} className="flex flex-col gap-2 rounded-[10px] border-2 border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black">Blank {n + 1} <code className="text-xs text-muted-foreground">[[{id}]]</code></span>
              <label className="flex items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={!!b.choices}
                  onChange={(e) => writeBlank(id, { choices: e.target.checked ? (accepted.filter(Boolean).length ? [...accepted.filter(Boolean), ""] : ["", ""]) : null })}
                />
                Dropdown
              </label>
            </div>
            {b.choices ? (
              <>
                <StringList
                  label="Choices in the dropdown"
                  values={b.choices}
                  min={2}
                  max={12}
                  onChange={(v) => writeBlank(id, { choices: v })}
                />
                <FormField label="Correct choice" htmlFor={`qe-fb-${id}`}>
                  <SelectInput
                    id={`qe-fb-${id}`}
                    options={b.choices.filter(Boolean).map((c) => ({ value: c, label: c }))}
                    value={accepted[0] ?? ""}
                    onChange={(e) => set({ answer: { ...answer, [id]: [e.target.value] } })}
                  />
                </FormField>
              </>
            ) : (
              <StringList
                label="Accepted answers"
                values={accepted}
                max={20}
                onChange={(v) => set({ answer: { ...answer, [id]: v } })}
              />
            )}
          </div>
        );
      })}
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" className="size-4" checked={o.caseSensitive} onChange={(e) => set({ options: { ...o, caseSensitive: e.target.checked, blanks: ids.map(blankOf) } })} />
        Case-sensitive
      </label>
    </div>
  );
}

function NumericEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const o = obj(q.options, { unit: null as string | null, decimals: null as number | null });
  const a = obj(q.answer, { value: 0, tolerance: 0, mode: "abs" as "abs" | "pct" });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="Correct value" htmlFor="qe-num-v">
        <TextInput id="qe-num-v" type="number" step="any" value={a.value} onChange={(e) => set({ answer: { ...a, value: Number(e.target.value) } })} />
      </FormField>
      <FormField label="Unit shown to the candidate" htmlFor="qe-num-u">
        <TextInput id="qe-num-u" maxLength={30} placeholder="e.g. m/s²" value={o.unit ?? ""} onChange={(e) => set({ options: { ...o, unit: e.target.value || null } })} />
      </FormField>
      <FormField label="Tolerance" htmlFor="qe-num-t">
        <TextInput id="qe-num-t" type="number" min={0} step="any" value={a.tolerance} onChange={(e) => set({ answer: { ...a, tolerance: Math.max(0, Number(e.target.value)) } })} />
      </FormField>
      <FormField label="Tolerance is" htmlFor="qe-num-m">
        <SelectInput
          id="qe-num-m"
          allowEmpty={false}
          options={[
            { value: "abs", label: "± absolute amount" },
            { value: "pct", label: "± percent of the value" },
          ]}
          value={a.mode}
          onChange={(e) => set({ answer: { ...a, mode: e.target.value } })}
        />
      </FormField>
    </div>
  );
}

function MatchingEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const o = obj(q.options, { left: ["", ""], right: ["", ""], shuffleLeft: false });
  const a = arr<number>(q.answer, o.left.map((_, i) => i));
  const pairs = o.left.map((l, i) => ({ left: l, right: o.right[a[i]] ?? "" }));
  const used = new Set(a);
  const extras = o.right.filter((_, j) => !used.has(j));
  const write = (nextPairs: { left: string; right: string }[], nextExtras: string[]) =>
    set({
      options: { ...o, left: nextPairs.map((p) => p.left), right: [...nextPairs.map((p) => p.right), ...nextExtras] },
      answer: nextPairs.map((_, i) => i),
    });
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-bold">Pairs (written correctly — the right side is shuffled for candidates)</legend>
        {pairs.map((p, i) => (
          <Row key={i}>
            <TextInput aria-label={`Left ${i + 1}`} value={p.left} placeholder="Item" onChange={(e) => write(pairs.map((x, j) => (j === i ? { ...x, left: e.target.value } : x)), extras)} />
            <span className="grid h-10 place-items-center text-muted-foreground"><Icon name="arrow-right" className="size-4" /></span>
            <TextInput aria-label={`Right ${i + 1}`} value={p.right} placeholder="Its match" onChange={(e) => write(pairs.map((x, j) => (j === i ? { ...x, right: e.target.value } : x)), extras)} />
            <IconBtn label="Remove pair" icon="x" disabled={pairs.length <= 2} onClick={() => write(pairs.filter((_, j) => j !== i), extras)} />
          </Row>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" disabled={pairs.length >= 20} onClick={() => write([...pairs, { left: "", right: "" }], extras)}>
            Add pair
          </Button>
        </div>
      </fieldset>
      <StringList
        label="Extra wrong matches (distractors, optional)"
        values={extras}
        min={0}
        max={6}
        onChange={(v) => write(pairs, v)}
      />
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" className="size-4" checked={o.shuffleLeft} onChange={(e) => set({ options: { ...o, shuffleLeft: e.target.checked } })} />
        Shuffle the left side too
      </label>
    </div>
  );
}

function OrderingEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const o = obj(q.options, { items: ["", "", ""] });
  return (
    <StringList
      label="Items in the CORRECT order (candidates see them shuffled)"
      values={o.items}
      min={2}
      max={20}
      reorder
      onChange={(items) => set({ options: { items }, answer: {} })}
      placeholder={(i) => `Step ${i + 1}`}
    />
  );
}

function CategorizeEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const o = obj(q.options, { categories: ["", ""], items: ["", ""] });
  const a = arr<number>(q.answer, []);
  return (
    <div className="flex flex-col gap-3">
      <StringList
        label="Groups"
        values={o.categories}
        min={2}
        max={8}
        onChange={(categories) => set({ options: { ...o, categories }, answer: a.map((c) => Math.min(c, categories.length - 1)) })}
        placeholder={(i) => `Group ${i + 1}`}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-bold">Items and the group each belongs to</legend>
        {o.items.map((it, i) => (
          <Row key={i}>
            <TextInput aria-label={`Item ${i + 1}`} value={it} placeholder="Item" onChange={(e) => set({ options: { ...o, items: o.items.map((x, j) => (j === i ? e.target.value : x)) } })} />
            <SelectInput
              aria-label={`Group for item ${i + 1}`}
              allowEmpty={false}
              className="max-w-48"
              options={o.categories.map((c, j) => ({ value: String(j), label: c || `Group ${j + 1}` }))}
              value={String(a[i] ?? 0)}
              onChange={(e) => {
                const next = o.items.map((_, j) => a[j] ?? 0);
                next[i] = Number(e.target.value);
                set({ answer: next });
              }}
            />
            <IconBtn
              label="Remove item"
              icon="x"
              disabled={o.items.length <= 2}
              onClick={() => set({ options: { ...o, items: o.items.filter((_, j) => j !== i) }, answer: o.items.map((_, j) => a[j] ?? 0).filter((_, j) => j !== i) })}
            />
          </Row>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={o.items.length >= 30}
            onClick={() => set({ options: { ...o, items: [...o.items, ""] }, answer: [...o.items.map((_, j) => a[j] ?? 0), 0] })}
          >
            Add item
          </Button>
        </div>
      </fieldset>
    </div>
  );
}

function HotspotEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const o = obj(q.options, { imageUrl: "", alt: "" });
  const a = obj(q.answer, { regions: [] as HotspotRegion[] });
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pct = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  const round = (n: number) => Math.round(n * 10) / 10;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border-2 border-border bg-card px-3 py-2 text-sm font-bold hover:bg-muted">
          <Icon name="image" className="size-4" /> {busy ? "Uploading…" : o.imageUrl ? "Replace image" : "Upload image"}
          <input
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              const r = await uploadQuestionAsset(f);
              setBusy(false);
              if ("error" in r) return setError(r.error);
              set({ options: { ...o, imageUrl: r.url }, answer: { regions: [] } });
            }}
          />
        </label>
        <TextInput
          aria-label="Image link"
          placeholder="…or paste an https:// image link"
          className="max-w-md"
          value={o.imageUrl}
          onChange={(e) => set({ options: { ...o, imageUrl: e.target.value } })}
        />
      </div>
      {error ? <p className="text-xs font-bold text-destructive">{error}</p> : null}
      {o.imageUrl ? (
        <>
          <p className="text-xs font-bold text-muted-foreground">Drag on the image to draw each correct area. A click anywhere inside one is correct.</p>
          <div
            ref={ref}
            className="relative inline-block max-w-full cursor-crosshair touch-none select-none self-start overflow-hidden rounded-[10px] border-2 border-border"
            onPointerDown={(e) => {
              const p = pct(e);
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              setDrag({ x: p.x, y: p.y, x2: p.x, y2: p.y });
            }}
            onPointerMove={(e) => drag && setDrag({ ...drag, x2: pct(e).x, y2: pct(e).y })}
            onPointerUp={() => {
              if (!drag) return;
              const x = Math.min(drag.x, drag.x2);
              const y = Math.min(drag.y, drag.y2);
              const w = Math.abs(drag.x2 - drag.x);
              const h = Math.abs(drag.y2 - drag.y);
              setDrag(null);
              if (w < 1 || h < 1) return;
              set({ answer: { regions: [...a.regions, { shape: "rect", x: round(x), y: round(y), w: round(w), h: round(h) }] } });
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={o.imageUrl} alt={o.alt} draggable={false} className="block max-h-[420px] w-auto max-w-full" />
            {a.regions.map((r, i) =>
              r.shape === "rect" ? (
                <span key={i} className="pointer-events-none absolute border-[3px] border-[var(--success)] bg-[var(--success)]/25" style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }} />
              ) : (
                <span key={i} className="pointer-events-none absolute rounded-full border-[3px] border-[var(--success)] bg-[var(--success)]/25" style={{ left: `${r.cx - r.rx}%`, top: `${r.cy - r.ry}%`, width: `${r.rx * 2}%`, height: `${r.ry * 2}%` }} />
              )
            )}
            {drag ? (
              <span className="pointer-events-none absolute border-[3px] border-dashed border-primary" style={{ left: `${Math.min(drag.x, drag.x2)}%`, top: `${Math.min(drag.y, drag.y2)}%`, width: `${Math.abs(drag.x2 - drag.x)}%`, height: `${Math.abs(drag.y2 - drag.y)}%` }} />
            ) : null}
          </div>
          {a.regions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {a.regions.map((_, i) => (
                <Button key={i} type="button" size="sm" variant="outline" onClick={() => set({ answer: { regions: a.regions.filter((__, j) => j !== i) } })}>
                  Remove area {i + 1}
                </Button>
              ))}
            </div>
          ) : null}
          <FormField label="Describe the image (alt text)" htmlFor="qe-hs-alt">
            <TextInput id="qe-hs-alt" maxLength={300} value={o.alt} onChange={(e) => set({ options: { ...o, alt: e.target.value } })} />
          </FormField>
        </>
      ) : null}
    </div>
  );
}

function MatrixEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const o = obj(q.options, { rows: ["", ""], columns: ["True", "False"], multiple: false });
  const a = arr<number[]>(q.answer, []);
  const toggle = (r: number, c: number) => {
    const next = o.rows.map((_, i) => [...(a[i] ?? [])]);
    if (o.multiple) next[r] = next[r].includes(c) ? next[r].filter((x) => x !== c) : [...next[r], c].sort();
    else next[r] = [c];
    set({ answer: next });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <StringList label="Rows (statements)" values={o.rows} max={20} onChange={(rows) => set({ options: { ...o, rows }, answer: rows.map((_, i) => a[i] ?? []) })} />
        <StringList label="Columns" values={o.columns} min={2} max={8} onChange={(columns) => set({ options: { ...o, columns }, answer: a.map((r) => r.filter((c) => c < columns.length)) })} />
      </div>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" className="size-4" checked={o.multiple} onChange={(e) => set({ options: { ...o, multiple: e.target.checked } })} />
        Allow more than one column per row
      </label>
      <div className="overflow-x-auto rounded-[10px] border-2 border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="p-2 text-left text-xs font-black uppercase">Correct answers</th>
              {o.columns.map((c, i) => (
                <th key={i} className="p-2 text-xs font-black uppercase">{c || `Col ${i + 1}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {o.rows.map((row, r) => (
              <tr key={r} className="border-t-2 border-border">
                <td className="p-2 font-semibold">{row || `Row ${r + 1}`}</td>
                {o.columns.map((_, c) => (
                  <td key={c} className="p-1 text-center">
                    <button
                      type="button"
                      aria-label={`Row ${r + 1} column ${c + 1} correct`}
                      aria-pressed={(a[r] ?? []).includes(c)}
                      onClick={() => toggle(r, c)}
                      className={cn("mx-auto grid size-8 place-items-center rounded-full border-2", (a[r] ?? []).includes(c) ? "border-[var(--success)] bg-[var(--success)] text-white" : "border-border")}
                    >
                      {(a[r] ?? []).includes(c) ? "✓" : ""}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EquationEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const a = obj(q.answer, { accepted: [""], mode: "equivalent" as "equivalent" | "exact", tolerance: 1e-6 });
  const o = obj(q.options, { placeholder: null as string | null });
  return (
    <div className="flex flex-col gap-3">
      <StringList label="Correct expression(s) — LaTeX or plain maths" values={a.accepted.length ? a.accepted : [""]} max={10} onChange={(accepted) => set({ answer: { ...a, accepted } })} placeholder={() => "e.g. \\frac{x^2}{2}+C  or  (x+1)^2"} />
      <div className="flex flex-wrap gap-3">
        {a.accepted.filter((x) => x.trim()).map((x, i) => (
          <div key={i} className="rounded-[8px] border-2 border-border bg-background px-3 py-1">
            <TexPreview tex={x} />
          </div>
        ))}
      </div>
      <FormField label="Checking" htmlFor="qe-eq-mode">
        <SelectInput
          id="qe-eq-mode"
          allowEmpty={false}
          options={[
            { value: "equivalent", label: "Any mathematically equivalent answer (recommended)" },
            { value: "exact", label: "Exactly as written (spacing ignored)" },
          ]}
          value={a.mode}
          onChange={(e) => set({ answer: { ...a, mode: e.target.value } })}
        />
      </FormField>
      <FormField label="Input placeholder (optional)" htmlFor="qe-eq-ph">
        <TextInput id="qe-eq-ph" maxLength={100} value={o.placeholder ?? ""} onChange={(e) => set({ options: { placeholder: e.target.value || null } })} />
      </FormField>
      <p className="text-xs font-medium text-muted-foreground">
        Equivalent checking evaluates both expressions at several points, so <MathText>{"$2(x+1)$"}</MathText> matches{" "}
        <MathText>{"$2x+2$"}</MathText>. Use exact matching for answers that must be in a particular form (e.g. simplified).
      </p>
    </div>
  );
}

function FileUploadEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const o = obj(q.options, { accept: ["application/pdf", "image/*"], maxMb: 10 });
  const kinds = [
    { value: "application/pdf", label: "PDF" },
    { value: "image/*", label: "Images (photos, scans)" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 text-[13px] font-bold">Allowed files</legend>
        {kinds.map((k) => (
          <label key={k.value} className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              className="size-4"
              checked={o.accept.includes(k.value)}
              onChange={(e) => set({ options: { ...o, accept: e.target.checked ? [...o.accept, k.value] : o.accept.filter((x) => x !== k.value) } })}
            />
            {k.label}
          </label>
        ))}
      </fieldset>
      <FormField label="Largest file (MB)" htmlFor="qe-fu-mb">
        <TextInput id="qe-fu-mb" type="number" min={1} max={25} className="max-w-28" value={o.maxMb} onChange={(e) => set({ options: { ...o, maxMb: Math.min(25, Math.max(1, parseInt(e.target.value, 10) || 1)) } })} />
      </FormField>
    </div>
  );
}

function AudioEditor({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const o = obj(q.options, { maxSec: 120 });
  return (
    <FormField label="Longest recording (seconds)" htmlFor="qe-au">
      <TextInput id="qe-au" type="number" min={10} max={900} className="max-w-28" value={o.maxSec} onChange={(e) => set({ options: { maxSec: Math.min(900, Math.max(10, parseInt(e.target.value, 10) || 10)) } })} />
    </FormField>
  );
}

function CodeEditorFields({ q, set }: { q: EditorQuestion; set: SetQ }) {
  const o = obj(q.options, { language: "python", starter: "" });
  const a = obj(q.answer, { keywords: [] as string[] });
  return (
    <div className="flex flex-col gap-3">
      <FormField label="Language" htmlFor="qe-code-lang">
        <SelectInput
          id="qe-code-lang"
          allowEmpty={false}
          options={["python", "javascript", "typescript", "java", "c", "cpp", "csharp", "php", "sql", "html", "go", "other"].map((l) => ({ value: l, label: l }))}
          value={o.language}
          onChange={(e) => set({ options: { ...o, language: e.target.value } })}
        />
      </FormField>
      <FormField label="Starter code (optional)" htmlFor="qe-code-start">
        <TextArea id="qe-code-start" className="min-h-28 font-mono text-sm" maxLength={5000} value={o.starter} onChange={(e) => set({ options: { ...o, starter: e.target.value } })} />
      </FormField>
      <StringList
        label="Marker hints: keywords a good answer uses (optional)"
        hint="Never run. The marker sees which of these appear."
        values={a.keywords}
        min={0}
        max={30}
        onChange={(keywords) => set({ answer: { keywords } })}
      />
    </div>
  );
}
