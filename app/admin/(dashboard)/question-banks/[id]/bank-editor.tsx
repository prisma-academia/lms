"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useSavedSnapshot, useUnsavedGuard } from "@/components/use-unsaved-guard";
import type { QuestionTypeValue } from "@/lib/schemas/question";
import type { EssayRubric, RubricCriterion } from "@/lib/schemas/essay-grading";

type QType = QuestionTypeValue;

export type BankQuestion = {
  id: string;
  type: QType;
  prompt: string;
  options: string[];
  answer: (number | string)[];
  /** ESSAY only. */
  rubric: EssayRubric | null;
  points: number;
  tagIds: string[];
  /** A nudge a learner can ask for while answering. */
  hint: string | null;
};

const HINT_MAX = 500;

/** Stable criterion id, generated once at authoring time and never shown. */
function newCriterionId(): string {
  return `c_${Math.random().toString(36).slice(2, 10)}`;
}

function blankCriterion(): RubricCriterion {
  return { id: newCriterionId(), label: "", description: "", weight: 1 };
}

type Tag = { id: string; name: string };
type Group = { id: string; name: string };

/** Record, not an array literal: adding a question type is then a compile error here. */
const TYPE_LABELS: Record<QType, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  TRUE_FALSE: "True / False",
  SHORT_ANSWER: "Short answer",
  ESSAY: "Essay (AI graded)",
};

const TYPE_OPTIONS = (Object.keys(TYPE_LABELS) as QType[]).map((value) => ({
  value,
  label: TYPE_LABELS[value],
}));

function typeLabel(t: QType): string {
  return TYPE_LABELS[t] ?? t;
}

export function BankEditor({
  id,
  initial,
  questions: initialQuestions,
  tags: initialTags,
  groups,
  accessGroupIds,
  canWrite,
}: {
  id: string;
  initial: { name: string; description: string };
  questions: BankQuestion[];
  tags: Tag[];
  groups: Group[];
  accessGroupIds: string[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [questions, setQuestions] = useState(initialQuestions);
  const [tags, setTags] = useState(initialTags);
  const [access, setAccess] = useState<Set<string>>(new Set(accessGroupIds));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Question editor state
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [qType, setQType] = useState<QType>("SINGLE_CHOICE");
  const [qPrompt, setQPrompt] = useState("");
  const [qOptions, setQOptions] = useState<string[]>(["", ""]);
  const [qCorrectSingle, setQCorrectSingle] = useState(0);
  const [qCorrectMulti, setQCorrectMulti] = useState<Set<number>>(new Set());
  const [qShort, setQShort] = useState("");
  const [qPoints, setQPoints] = useState("1");
  const [qTagIds, setQTagIds] = useState<Set<string>>(new Set());
  const [newTag, setNewTag] = useState("");
  // ESSAY rubric
  const [qCriteria, setQCriteria] = useState<RubricCriterion[]>([blankCriterion()]);
  const [qModelAnswer, setQModelAnswer] = useState("");
  const [qMinWords, setQMinWords] = useState("");
  const [qMaxWords, setQMaxWords] = useState("");
  const [qHint, setQHint] = useState("");

  // Closing or reloading the tab over unsaved work asks first. This page has
  // three things that are saved separately, so each is tracked separately:
  // the bank's own details, who it is shared with, and the question form —
  // whose "saved" state is whatever it held when it was opened (`editing` is
  // the reset key), so opening a question just to read it is not unsaved work.
  const savedDetails = useSavedSnapshot({ name, description });
  const savedAccess = useSavedSnapshot([...access].sort());
  const savedQuestion = useSavedSnapshot(
    editing === null
      ? null
      : {
          qType,
          qPrompt,
          qOptions,
          qCorrectSingle,
          qCorrectMulti: [...qCorrectMulti].sort(),
          qShort,
          qPoints,
          qTagIds: [...qTagIds].sort(),
          qCriteria,
          qModelAnswer,
          qMinWords,
          qMaxWords,
          qHint,
        },
    editing
  );
  useUnsavedGuard(canWrite && (savedDetails.dirty || savedAccess.dirty || savedQuestion.dirty));

  function resetQuestionForm() {
    setQType("SINGLE_CHOICE");
    setQPrompt("");
    setQOptions(["", ""]);
    setQCorrectSingle(0);
    setQCorrectMulti(new Set());
    setQShort("");
    setQPoints("1");
    setQTagIds(new Set());
    // Seed one blank row so the rubric form is never structurally invalid.
    setQCriteria([blankCriterion()]);
    setQModelAnswer("");
    setQMinWords("");
    setQMaxWords("");
    setQHint("");
  }

  function startAdd() {
    resetQuestionForm();
    setEditing("new");
  }

  function startEdit(q: BankQuestion) {
    setEditing(q.id);
    setQType(q.type);
    setQPrompt(q.prompt);
    setQPoints(String(q.points));
    setQTagIds(new Set(q.tagIds));
    setQHint(q.hint ?? "");
    if (q.type === "ESSAY") {
      setQCriteria(q.rubric?.criteria.length ? q.rubric.criteria : [blankCriterion()]);
      setQModelAnswer(q.rubric?.modelAnswer ?? "");
      setQMinWords(q.rubric?.minWords != null ? String(q.rubric.minWords) : "");
      setQMaxWords(q.rubric?.maxWords != null ? String(q.rubric.maxWords) : "");
      setQOptions(["", ""]);
    } else if (q.type === "SHORT_ANSWER") {
      setQShort((q.answer as string[]).join("\n"));
      setQOptions(["", ""]);
    } else if (q.type === "TRUE_FALSE") {
      setQOptions(["True", "False"]);
      setQCorrectSingle(Number(q.answer[0] ?? 0));
    } else {
      setQOptions(q.options.length ? q.options : ["", ""]);
      if (q.type === "SINGLE_CHOICE") setQCorrectSingle(Number(q.answer[0] ?? 0));
      else setQCorrectMulti(new Set((q.answer as number[]).map(Number)));
    }
  }

  async function saveDetails() {
    setError(null);
    setInfo(null);
    const res = await apiPatch(`/api/tenant/question-banks/${id}`, {
      name: name.trim(),
      description: description.trim() === "" ? null : description,
    });
    if (res.error) return setError(res.error.message);
    savedDetails.markSaved();
    setInfo("Saved.");
    toast("Question bank saved");
    router.refresh();
  }

  async function saveAccess() {
    setError(null);
    const res = await apiPost(`/api/tenant/question-banks/${id}/access`, { userGroupIds: [...access] });
    if (res.error) return setError(res.error.message);
    savedAccess.markSaved();
    setInfo("Sharing updated.");
    toast("Sharing updated");
    router.refresh();
  }

  async function createTag() {
    if (!newTag.trim()) return;
    const res = await apiPost<{ tag: Tag }>("/api/tenant/question-tags", { name: newTag.trim() });
    if (res.error) return setError(res.error.message);
    const tag = res.data!.tag;
    setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
    setQTagIds((prev) => new Set(prev).add(tag.id));
    setNewTag("");
  }

  function buildPayload() {
    const points = parseInt(qPoints, 10) || 0;
    const tagIds = [...qTagIds];
    if (qType === "ESSAY") {
      const rubric: EssayRubric = {
        criteria: qCriteria.map((c) => ({
          id: c.id,
          label: c.label.trim(),
          description: c.description.trim(),
          weight: c.weight,
        })),
        modelAnswer: qModelAnswer.trim() === "" ? null : qModelAnswer.trim(),
        minWords: qMinWords.trim() === "" ? null : parseInt(qMinWords, 10) || null,
        maxWords: qMaxWords.trim() === "" ? null : parseInt(qMaxWords, 10) || null,
      };
      return { type: qType, prompt: qPrompt.trim(), options: [], answer: [], rubric, points, tagIds };
    }
    if (qType === "SHORT_ANSWER") {
      const answer = qShort.split("\n").map((s) => s.trim()).filter(Boolean);
      return { type: qType, prompt: qPrompt.trim(), options: [], answer, points, tagIds };
    }
    if (qType === "TRUE_FALSE") {
      return { type: qType, prompt: qPrompt.trim(), options: ["True", "False"], answer: [qCorrectSingle], points, tagIds };
    }
    const options = qOptions.map((o) => o.trim()).filter(Boolean);
    const answer =
      qType === "SINGLE_CHOICE" ? [qCorrectSingle] : [...qCorrectMulti].filter((i) => i < options.length).sort((a, b) => a - b);
    return { type: qType, prompt: qPrompt.trim(), options, answer, points, tagIds };
  }

  async function saveQuestion() {
    setError(null);
    const payload = { ...buildPayload(), hint: qHint.trim() || null };
    if (!payload.prompt) return setError("Prompt is required.");
    if ((qType === "SINGLE_CHOICE" || qType === "MULTIPLE_CHOICE") && payload.options.length < 2) {
      return setError("Add at least two options.");
    }
    if (qType === "MULTIPLE_CHOICE" && payload.answer.length === 0) {
      return setError("Select at least one correct option.");
    }
    if (qType === "SHORT_ANSWER" && payload.answer.length === 0) {
      return setError("Add at least one acceptable answer.");
    }
    if (qType === "ESSAY") {
      const criteria = payload.rubric?.criteria ?? [];
      if (criteria.length === 0) return setError("Add at least one rubric criterion.");
      if (criteria.some((c) => !c.label)) return setError("Every rubric criterion needs a label.");
      if (criteria.some((c) => !Number.isInteger(c.weight) || c.weight < 1)) {
        return setError("Every rubric criterion needs a weight of 1 or more.");
      }
    }

    if (editing === "new") {
      const res = await apiPost<{ question: { id: string } }>(`/api/tenant/question-banks/${id}/questions`, payload);
      if (res.error) return setError(res.error.message);
      // The route returns the stored row (optionsJson / answerJson), not this
      // editor's shape, so the local copy is built from what was just sent.
      // Using the row as-is left a new question that crashed when reopened.
      const added = { rubric: null, ...payload, id: res.data!.question.id } as BankQuestion;
      setQuestions((prev) => [added, ...prev]);
    } else if (editing) {
      const res = await apiPatch<{ question: BankQuestion }>(`/api/tenant/questions/${editing}`, payload);
      if (res.error) return setError(res.error.message);
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === editing ? ({ ...q, rubric: null, ...payload, id: editing } as BankQuestion) : q
        )
      );
    }
    setEditing(null);
    router.refresh();
  }

  async function deleteQuestion(qid: string) {
    const question = questions.find((q) => q.id === qid);
    const yes = await confirm({
      title: "Delete this question?",
      description: (
        <>
          {question?.prompt ? <span className="mb-2 block font-bold text-foreground">“{question.prompt.slice(0, 140)}{question.prompt.length > 140 ? "…" : ""}”</span> : null}
          It is removed from this bank and from every quiz that uses it. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete question",
      destructive: true,
    });
    if (!yes) return;
    setError(null);
    const res = await apiDelete(`/api/tenant/questions/${qid}`);
    if (res.error) return setError(res.error.message);
    setQuestions((prev) => prev.filter((q) => q.id !== qid));
    toast("Question deleted");
  }

  async function deleteBank() {
    const yes = await confirm({
      title: `Delete “${name.trim() || initial.name}”?`,
      description:
        questions.length > 0
          ? `The bank and its ${questions.length} ${questions.length === 1 ? "question" : "questions"} are deleted, and those questions disappear from any quiz that uses them. This cannot be undone.`
          : "The bank is deleted. This cannot be undone.",
      confirmLabel: "Delete bank",
      destructive: true,
    });
    if (!yes) return;
    setError(null);
    const res = await apiDelete(`/api/tenant/question-banks/${id}`);
    if (res.error) return setError(res.error.message);
    toast("Question bank deleted");
    router.push("/admin/question-banks");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="font-heading text-lg leading-tight">Bank details</h2>
        <div className="mt-4 flex max-w-xl flex-col gap-4">
          <FormField label="Name" htmlFor="b-name">
            <TextInput id="b-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
          </FormField>
          <FormField label="Description" htmlFor="b-desc">
            <TextArea id="b-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite} />
          </FormField>
          {canWrite ? (
            // The destructive action sits apart from the primary one.
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" onClick={saveDetails}>Save changes</Button>
              <Button type="button" variant="destructive" onClick={deleteBank}>Delete bank</Button>
            </div>
          ) : null}
        </div>
      </Card>

      {canWrite ? (
        <Card>
          <h2 className="font-heading text-lg leading-tight">Who can use this bank</h2>
          <p className="mt-1 text-[13px] font-medium text-muted-foreground">
            Pick staff groups to limit the bank to them. With none picked, every staff member who
            can work with quizzes can use it.
          </p>
          {groups.length === 0 ? (
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              There are no staff groups yet, so the bank is open to all staff who can work with
              quizzes.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Staff groups that can use this bank">
              {groups.map((g) => {
                const on = access.has(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() =>
                      setAccess((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.id)) next.delete(g.id);
                        else next.add(g.id);
                        return next;
                      })
                    }
                    aria-pressed={on}
                    className={`min-h-9 rounded-full border-2 border-border px-3 py-1 text-sm font-bold [touch-action:manipulation] outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground hover:bg-muted"}`}
                  >
                    {/* The tick carries the state for anyone who cannot tell the two fills apart. */}
                    {on ? "✓ " : ""}
                    {g.name}
                  </button>
                );
              })}
            </div>
          )}
          {groups.length > 0 ? (
            <div className="mt-3">
              <Button type="button" variant="outline" onClick={saveAccess}>Save sharing</Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg leading-tight">
            Questions <span className="num text-muted-foreground">({questions.length})</span>
          </h2>
          {canWrite && editing === null ? (
            <Button type="button" size="sm" onClick={startAdd}>Add question</Button>
          ) : null}
        </div>

        {editing !== null ? (
          <div className="mt-4 rounded-[10px] border-2 border-border bg-background p-4">
            <div className="grid gap-3">
              <FormField label="Type" htmlFor="q-type">
                <SelectInput
                  id="q-type"
                  allowEmpty={false}
                  options={TYPE_OPTIONS}
                  value={qType}
                  onChange={(e) => setQType(e.target.value as QType)}
                />
              </FormField>
              <FormField label="Prompt" htmlFor="q-prompt">
                <TextArea id="q-prompt" value={qPrompt} onChange={(e) => setQPrompt(e.target.value)} />
              </FormField>

              {qType === "ESSAY" ? (
                <div className="flex flex-col gap-3">
                  <div>
                    <span className="text-[13px] font-bold text-foreground">Rubric criteria</span>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      The AI grades against these and nothing else. Write criteria that can be
                      checked objectively — &ldquo;names all three phases of X&rdquo;, not
                      &ldquo;shows good understanding&rdquo;. Each criterion is marked not met,
                      partly met, mostly met or fully met, and the result counts towards the
                      quiz&rsquo;s pass mark — so vague wording costs learners marks.
                    </p>
                    <div className="mt-2 flex flex-col gap-3">
                      {qCriteria.map((c, idx) => (
                        <div key={c.id} className="rounded-[10px] border-2 border-border bg-card p-3">
                          <div className="flex items-center gap-2">
                            <TextInput
                              value={c.label}
                              onChange={(e) =>
                                setQCriteria((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x))
                                )
                              }
                              placeholder={`Criterion ${idx + 1}`}
                            />
                            <label className="flex shrink-0 items-center gap-1 text-xs font-bold text-muted-foreground">
                              Weight
                              <input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                max="100"
                                value={c.weight}
                                onChange={(e) =>
                                  setQCriteria((prev) =>
                                    prev.map((x, i) =>
                                      i === idx
                                        ? { ...x, weight: Math.max(1, Number(e.target.value) || 1) }
                                        : x
                                    )
                                  )
                                }
                                className="w-16 rounded-[8px] border-2 border-border bg-card px-2 py-1 text-sm text-card-foreground outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                              />
                            </label>
                            {qCriteria.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => setQCriteria((prev) => prev.filter((_, i) => i !== idx))}
                                className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-destructive outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                                aria-label={`Remove criterion ${idx + 1}`}
                              >
                                ✕
                              </button>
                            ) : null}
                          </div>
                          <TextArea
                            className="mt-2"
                            value={c.description}
                            onChange={(e) =>
                              setQCriteria((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, description: e.target.value } : x
                                )
                              )
                            }
                            placeholder="What earns full marks for this criterion?"
                          />
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      disabled={qCriteria.length >= 8}
                      onClick={() => setQCriteria((prev) => [...prev, blankCriterion()])}
                    >
                      Add criterion
                    </Button>
                  </div>

                  <FormField label="Model answer (optional)" htmlFor="q-model">
                    <TextArea
                      id="q-model"
                      value={qModelAnswer}
                      onChange={(e) => setQModelAnswer(e.target.value)}
                      placeholder="One acceptable answer. The grader is told a different but equally valid answer still earns full marks."
                    />
                  </FormField>

                  <div className="flex gap-3">
                    <FormField label="Min words (optional)" htmlFor="q-minw">
                      <TextInput
                        id="q-minw"
                        type="number"
                        min="0"
                        value={qMinWords}
                        onChange={(e) => setQMinWords(e.target.value)}
                      />
                    </FormField>
                    <FormField label="Max words (optional)" htmlFor="q-maxw">
                      <TextInput
                        id="q-maxw"
                        type="number"
                        min="1"
                        value={qMaxWords}
                        onChange={(e) => setQMaxWords(e.target.value)}
                      />
                    </FormField>
                  </div>
                </div>
              ) : qType === "SHORT_ANSWER" ? (
                <FormField label="Acceptable answers (one per line)" htmlFor="q-short">
                  <TextArea id="q-short" value={qShort} onChange={(e) => setQShort(e.target.value)} />
                </FormField>
              ) : qType === "TRUE_FALSE" ? (
                <FormField label="Correct answer" htmlFor="q-tf">
                  <SelectInput
                    id="q-tf"
                    allowEmpty={false}
                    options={[
                      { value: "0", label: "True" },
                      { value: "1", label: "False" },
                    ]}
                    value={String(qCorrectSingle)}
                    onChange={(e) => setQCorrectSingle(Number(e.target.value))}
                  />
                </FormField>
              ) : (
                <div>
                  <span className="text-[13px] font-bold text-foreground">Options (mark the correct one{qType === "MULTIPLE_CHOICE" ? "s" : ""})</span>
                  <div className="mt-2 flex flex-col gap-2">
                    {qOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type={qType === "SINGLE_CHOICE" ? "radio" : "checkbox"}
                          name="q-correct"
                          aria-label={`Option ${idx + 1} is a correct answer`}
                          checked={qType === "SINGLE_CHOICE" ? qCorrectSingle === idx : qCorrectMulti.has(idx)}
                          onChange={() => {
                            if (qType === "SINGLE_CHOICE") setQCorrectSingle(idx);
                            else
                              setQCorrectMulti((prev) => {
                                const next = new Set(prev);
                                if (next.has(idx)) next.delete(idx);
                                else next.add(idx);
                                return next;
                              });
                          }}
                          className="size-4 shrink-0 accent-primary"
                        />
                        <TextInput
                          aria-label={`Option ${idx + 1}`}
                          value={opt}
                          onChange={(e) =>
                            setQOptions((prev) => prev.map((o, i) => (i === idx ? e.target.value : o)))
                          }
                          placeholder={`Option ${idx + 1}`}
                        />
                        {qOptions.length > 2 ? (
                          <button
                            type="button"
                            onClick={() => setQOptions((prev) => prev.filter((_, i) => i !== idx))}
                            className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-destructive outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                            aria-label={`Remove option ${idx + 1}`}
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setQOptions((prev) => [...prev, ""])}>
                    Add option
                  </Button>
                </div>
              )}

              <FormField
                label="Hint (optional)"
                htmlFor="q-hint"
                hint="A nudge towards the answer, shown only if the learner asks for it and the quiz allows hints. Point at the idea — do not give the answer away."
              >
                <TextArea
                  id="q-hint"
                  value={qHint}
                  maxLength={HINT_MAX}
                  onChange={(e) => setQHint(e.target.value)}
                  placeholder="e.g. Think about what has to happen before the request reaches the server."
                  className="min-h-16"
                />
              </FormField>

              <FormField label="Points" htmlFor="q-points">
                <TextInput id="q-points" type="number" min="0" value={qPoints} onChange={(e) => setQPoints(e.target.value)} />
              </FormField>

              <div>
                <span className="text-[13px] font-bold text-foreground">Tags</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tags.map((t) => {
                    const on = qTagIds.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setQTagIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(t.id)) next.delete(t.id);
                            else next.add(t.id);
                            return next;
                          })
                        }
                        aria-pressed={on}
                        className={`min-h-8 rounded-full border-2 border-border px-2.5 py-0.5 text-xs font-bold [touch-action:manipulation] outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground hover:bg-muted"}`}
                      >
                        {on ? "✓ " : ""}
                        {t.name}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <TextInput
                    aria-label="New tag name"
                    autoComplete="off"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter adds the tag; without this it would do nothing here.
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void createTag();
                      }
                    }}
                    placeholder="New tag…"
                    className="max-w-48"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={createTag}>Add tag</Button>
                </div>
              </div>

              {error ? (
                <p role="alert" className="text-sm font-bold text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={saveQuestion}>Save question</Button>
                <Button type="button" variant="outline" onClick={() => { setEditing(null); setError(null); }}>Cancel</Button>
              </div>
            </div>
          </div>
        ) : null}

        {questions.length === 0 && editing === null ? (
          <EmptyState
            icon="clipboard"
            title="No questions yet"
            action={
              canWrite ? (
                <Button type="button" size="sm" onClick={startAdd}>
                  Add question
                </Button>
              ) : undefined
            }
          >
            Add the questions for this topic here. They can then be used in any quiz.
          </EmptyState>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {questions.map((q) => (
              <li key={q.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 rounded-[10px] border-2 border-border bg-card px-3 py-2">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="line-clamp-2 text-sm font-bold text-foreground">{q.prompt || "—"}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge>{typeLabel(q.type)}</Badge>
                    <span>{q.points} pt</span>
                    {q.hint ? <span>· has a hint</span> : null}
                    {q.type === "ESSAY" ? (
                      <span>
                        · {q.rubric?.criteria.length ?? 0}{" "}
                        {(q.rubric?.criteria.length ?? 0) === 1 ? "criterion" : "criteria"}
                      </span>
                    ) : null}
                  </div>
                </div>
                {canWrite ? (
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => startEdit(q)}>Edit</Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => deleteQuestion(q.id)}>Delete</Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* While a question is open its own form shows the error; otherwise it
          would have nowhere to appear at all. */}
      {error && editing === null ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="text-sm font-medium text-muted-foreground">
          {info}
        </p>
      ) : null}
    </div>
  );
}
