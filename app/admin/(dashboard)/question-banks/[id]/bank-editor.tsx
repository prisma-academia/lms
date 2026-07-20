"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";

type QType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";

export type BankQuestion = {
  id: string;
  type: QType;
  prompt: string;
  options: string[];
  answer: (number | string)[];
  points: number;
  tagIds: string[];
};

type Tag = { id: string; name: string };
type Group = { id: string; name: string };

const TYPE_OPTIONS = [
  { value: "SINGLE_CHOICE", label: "Single choice" },
  { value: "MULTIPLE_CHOICE", label: "Multiple choice" },
  { value: "TRUE_FALSE", label: "True / False" },
  { value: "SHORT_ANSWER", label: "Short answer" },
];

function typeLabel(t: QType): string {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
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

  function resetQuestionForm() {
    setQType("SINGLE_CHOICE");
    setQPrompt("");
    setQOptions(["", ""]);
    setQCorrectSingle(0);
    setQCorrectMulti(new Set());
    setQShort("");
    setQPoints("1");
    setQTagIds(new Set());
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
    if (q.type === "SHORT_ANSWER") {
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
    setInfo("Saved.");
    router.refresh();
  }

  async function saveAccess() {
    setError(null);
    const res = await apiPost(`/api/tenant/question-banks/${id}/access`, { userGroupIds: [...access] });
    if (res.error) return setError(res.error.message);
    setInfo("Sharing updated.");
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
    const payload = buildPayload();
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

    if (editing === "new") {
      const res = await apiPost<{ question: BankQuestion }>(`/api/tenant/question-banks/${id}/questions`, payload);
      if (res.error) return setError(res.error.message);
      setQuestions((prev) => [{ ...res.data!.question, tagIds: payload.tagIds } as BankQuestion, ...prev]);
    } else if (editing) {
      const res = await apiPatch<{ question: BankQuestion }>(`/api/tenant/questions/${editing}`, payload);
      if (res.error) return setError(res.error.message);
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === editing ? ({ ...q, ...payload, id: editing } as BankQuestion) : q
        )
      );
    }
    setEditing(null);
    router.refresh();
  }

  async function deleteQuestion(qid: string) {
    if (!confirm("Delete this question?")) return;
    const res = await apiDelete(`/api/tenant/questions/${qid}`);
    if (res.error) return setError(res.error.message);
    setQuestions((prev) => prev.filter((q) => q.id !== qid));
  }

  async function deleteBank() {
    if (!confirm("Delete this question bank and all its questions?")) return;
    const res = await apiDelete(`/api/tenant/question-banks/${id}`);
    if (res.error) return setError(res.error.message);
    router.push("/admin/question-banks");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-sm font-semibold uppercase text-stone-500">Bank details</h2>
        <div className="mt-4 flex max-w-xl flex-col gap-4">
          <FormField label="Name" htmlFor="b-name">
            <TextInput id="b-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
          </FormField>
          <FormField label="Description" htmlFor="b-desc">
            <TextArea id="b-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite} />
          </FormField>
          {canWrite ? (
            <div className="flex gap-3">
              <Button type="button" onClick={saveDetails}>Save</Button>
              <Button type="button" variant="destructive" onClick={deleteBank}>Delete bank</Button>
            </div>
          ) : null}
        </div>
      </Card>

      {canWrite ? (
        <Card>
          <h2 className="text-sm font-semibold uppercase text-stone-500">Sharing</h2>
          <p className="mt-1 text-xs text-stone-500">
            Restrict this bank to specific user groups. No selection = all staff with quiz access.
          </p>
          {groups.length === 0 ? (
            <p className="mt-3 text-sm text-stone-600">No user groups yet.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
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
                    className={`rounded-full border-2 border-border px-3 py-1 text-sm font-bold ${on ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"}`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-3">
            <Button type="button" variant="outline" onClick={saveAccess}>Save sharing</Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-stone-500">Questions ({questions.length})</h2>
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

              {qType === "SHORT_ANSWER" ? (
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
                          className="size-4"
                        />
                        <TextInput
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
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove option"
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
                        className={`rounded-full border-2 border-border px-2.5 py-0.5 text-xs font-bold ${on ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"}`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <TextInput value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag…" className="max-w-48" />
                  <Button type="button" variant="outline" size="sm" onClick={createTag}>Add tag</Button>
                </div>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <div className="flex gap-2">
                <Button type="button" onClick={saveQuestion}>Save question</Button>
                <Button type="button" variant="outline" onClick={() => { setEditing(null); setError(null); }}>Cancel</Button>
              </div>
            </div>
          </div>
        ) : null}

        {questions.length === 0 && editing === null ? (
          <p className="mt-4 text-sm text-stone-600">No questions yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {questions.map((q) => (
              <li key={q.id} className="flex items-start justify-between gap-3 rounded-[10px] border-2 border-border bg-card px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{q.prompt || "—"}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge>{typeLabel(q.type)}</Badge>
                    <span>{q.points} pt</span>
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

      {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
    </div>
  );
}
