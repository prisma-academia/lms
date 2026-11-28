"use client";

import { useState } from "react";
import { apiDelete, apiPatch, apiPost } from "@/lib/client/api";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { FormField, TextArea, TextInput } from "@/components/form-field";
import { MathText } from "@/components/assessments/math-text";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type Passage = { id: string; title: string | null; stimulus: string; questionCount: number };

/**
 * Passages: a reading text, case study or data table that several questions
 * share. In the exam window it sits beside each of its questions.
 */
export function BankPassages({
  bankId,
  passages,
  onChange,
  canWrite,
}: {
  bankId: string;
  passages: Passage[];
  onChange: (p: Passage[]) => void;
  canWrite: boolean;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Passage | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [stimulus, setStimulus] = useState("");
  const [error, setError] = useState<string | null>(null);

  function open(p: Passage | "new") {
    setEditing(p);
    setTitle(p === "new" ? "" : p.title ?? "");
    setStimulus(p === "new" ? "" : p.stimulus);
    setError(null);
  }

  async function save() {
    if (!stimulus.trim()) return setError("Write the passage.");
    const body = { title: title.trim() || null, stimulus };
    if (editing === "new") {
      const res = await apiPost<{ group: { id: string } }>(`/api/tenant/question-banks/${bankId}/groups`, body);
      if (res.error) return setError(res.error.message);
      onChange([...passages, { id: res.data!.group.id, title: body.title, stimulus, questionCount: 0 }]);
    } else if (editing) {
      const res = await apiPatch(`/api/tenant/question-groups/${editing.id}`, body);
      if (res.error) return setError(res.error.message);
      onChange(passages.map((p) => (p.id === editing.id ? { ...p, title: body.title, stimulus } : p)));
    }
    setEditing(null);
  }

  async function remove(p: Passage) {
    const yes = await confirm({
      title: "Delete this passage?",
      description: p.questionCount
        ? `${p.questionCount} question${p.questionCount === 1 ? "" : "s"} use it. They stay in the bank, without the passage.`
        : "It is not used by any question.",
      confirmLabel: "Delete passage",
      destructive: true,
    });
    if (!yes) return;
    const res = await apiDelete(`/api/tenant/question-groups/${p.id}`);
    if (res.error) return setError(res.error.message);
    onChange(passages.filter((x) => x.id !== p.id));
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-lg leading-tight">Passages & shared stimuli</h2>
          <p className="mt-1 text-[13px] font-medium text-muted-foreground">
            A comprehension text or case study several questions refer to. Pick it in a question&apos;s settings.
          </p>
        </div>
        {canWrite && editing === null ? (
          <Button type="button" size="sm" variant="outline" onClick={() => open("new")}>
            Add passage
          </Button>
        ) : null}
      </div>
      {editing !== null ? (
        <div className="mt-4 flex flex-col gap-3 rounded-[10px] border-2 border-border bg-background p-4">
          <FormField label="Title (optional)" htmlFor="pg-title">
            <TextInput id="pg-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField label="Passage" htmlFor="pg-body" hint="Plain text; $maths$ works. Line breaks are kept.">
            <TextArea id="pg-body" className="min-h-48" maxLength={20000} value={stimulus} onChange={(e) => setStimulus(e.target.value)} />
          </FormField>
          {error ? (
            <p role="alert" className="text-sm font-bold text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" onClick={save}>
              Save passage
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {passages.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {passages.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 rounded-[10px] border-2 border-border bg-card px-3 py-2.5">
              <div className="min-w-0 flex-1 basis-64">
                <div className="text-sm font-black">{p.title || "Untitled passage"}</div>
                <MathText as="div" className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {p.stimulus}
                </MathText>
                <div className="mt-1 text-xs font-bold text-muted-foreground">
                  {p.questionCount} question{p.questionCount === 1 ? "" : "s"}
                </div>
              </div>
              {canWrite ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => open(p)}>
                    Edit
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => remove(p)}>
                    Delete
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
