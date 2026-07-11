"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { FormField, TextInput, TextArea } from "@/components/form-field";

export type Candidate = { id: string; prompt: string; type: string; bank: string; defaultPoints: number };
export type SelectedQ = { questionId: string; prompt: string; type: string; points: number };

export function QuizBuilder({
  id,
  initial,
  selectedQuestions,
  candidates,
  canWrite,
}: {
  id: string;
  initial: { title: string; description: string; passingScore: string; timeLimitMin: string };
  selectedQuestions: SelectedQ[];
  candidates: Candidate[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [passingScore, setPassingScore] = useState(initial.passingScore);
  const [timeLimit, setTimeLimit] = useState(initial.timeLimitMin);
  const [selected, setSelected] = useState<SelectedQ[]>(selectedQuestions);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.questionId)), [selected]);
  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((c) => !selectedIds.has(c.id) && (q === "" || c.prompt.toLowerCase().includes(q)));
  }, [candidates, selectedIds, query]);

  function move(index: number, dir: -1 | 1) {
    setSelected((prev) => {
      const next = [...prev];
      const t = index + dir;
      if (t < 0 || t >= next.length) return prev;
      [next[index], next[t]] = [next[t], next[index]];
      return next;
    });
  }

  async function save() {
    setError(null);
    setInfo(null);
    setSaving(true);
    try {
      const details = await apiPatch(`/api/tenant/quizzes/${id}`, {
        title: title.trim(),
        description: description.trim() === "" ? null : description,
        passingScore: passingScore.trim() ? parseInt(passingScore, 10) : null,
        timeLimitMin: timeLimit.trim() ? parseInt(timeLimit, 10) : null,
      });
      if (details.error) return setError(details.error.message);
      const qs = await apiPost(`/api/tenant/quizzes/${id}/questions`, {
        questions: selected.map((s, idx) => ({ questionId: s.questionId, sortOrder: idx, points: s.points })),
      });
      if (qs.error) return setError(qs.error.message);
      setInfo("Saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this quiz?")) return;
    const res = await apiDelete(`/api/tenant/quizzes/${id}`);
    if (res.error) return setError(res.error.message);
    router.push("/admin/quizzes");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-sm font-semibold uppercase text-stone-500">Quiz details</h2>
        <div className="mt-4 flex max-w-xl flex-col gap-4">
          <FormField label="Title" htmlFor="q-title">
            <TextInput id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canWrite} />
          </FormField>
          <FormField label="Description" htmlFor="q-desc">
            <TextArea id="q-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Pass mark %" htmlFor="q-pass">
              <TextInput id="q-pass" type="number" min="0" max="100" value={passingScore} onChange={(e) => setPassingScore(e.target.value)} disabled={!canWrite} />
            </FormField>
            <FormField label="Time limit (min)" htmlFor="q-time">
              <TextInput id="q-time" type="number" min="1" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} disabled={!canWrite} />
            </FormField>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold uppercase text-stone-500">Questions in this quiz</h2>
        {selected.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">No questions added yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {selected.map((s, idx) => (
              <li key={s.questionId} className="flex items-center justify-between gap-3 rounded-[10px] border-2 border-ink bg-paper px-3 py-2">
                <span className="min-w-0 truncate text-sm text-ink">
                  {idx + 1}. {s.prompt} <Badge>{s.points} pt</Badge>
                </span>
                {canWrite ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => move(idx, -1)}>↑</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => move(idx, 1)}>↓</Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => setSelected((prev) => prev.filter((x) => x.questionId !== s.questionId))}>
                      Remove
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canWrite ? (
          <div className="mt-6 border-t-2 border-dashed border-ink/25 pt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-ink">Add questions</h3>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search questions…"
                className="rounded-[10px] border-2 border-ink bg-card px-3 py-1.5 text-sm outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-[10px] border-2 border-ink">
              {available.length === 0 ? (
                <p className="p-3 text-sm text-ink/60">No more questions to add.</p>
              ) : (
                available.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 border-b border-ink/10 px-3 py-2 last:border-b-0">
                    <span className="min-w-0 truncate text-sm text-ink">
                      {c.prompt} <span className="text-xs text-ink/50">({c.bank})</span>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSelected((prev) => [
                          ...prev,
                          { questionId: c.id, prompt: c.prompt, type: c.type, points: c.defaultPoints },
                        ])
                      }
                    >
                      Add
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </Card>

      {error ? <p className="text-sm text-red">{error}</p> : null}
      {info ? <p className="text-sm text-ink/70">{info}</p> : null}

      {canWrite ? (
        <div className="flex gap-3">
          <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          <Button type="button" variant="destructive" onClick={onDelete}>Delete quiz</Button>
        </div>
      ) : null}
    </div>
  );
}
