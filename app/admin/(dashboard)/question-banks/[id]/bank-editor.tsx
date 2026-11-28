"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSavedSnapshot, useUnsavedGuard } from "@/components/use-unsaved-guard";
import { allQuestionTypes, questionType } from "@/lib/assessments/types";
import type { QuestionTypeValue } from "@/lib/schemas/question";
import { MathText } from "@/components/assessments/math-text";
import {
  QuestionEditor,
  blankQuestion,
  type EditorPayload,
  type EditorQuestion,
} from "@/components/assessments/question-editor";
import { BankImport } from "./bank-import";
import { BankPassages, type Passage } from "./bank-passages";

export type BankQuestion = EditorQuestion & { id: string; usage: number };

type Tag = { id: string; name: string };
type Group = { id: string; name: string };

const DIFFICULTY_LABEL = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" } as const;

export function BankEditor({
  id,
  initial,
  questions: initialQuestions,
  tags: initialTags,
  groups,
  passages: initialPassages,
  accessGroupIds,
  canWrite,
  aiEnabled,
}: {
  id: string;
  initial: { name: string; description: string };
  questions: BankQuestion[];
  tags: Tag[];
  groups: Group[];
  passages: Passage[];
  accessGroupIds: string[];
  canWrite: boolean;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [questions, setQuestions] = useState(initialQuestions);
  const [tags, setTags] = useState(initialTags);
  const [passages, setPassages] = useState(initialPassages);
  const [access, setAccess] = useState<Set<string>>(new Set(accessGroupIds));
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BankQuestion | EditorQuestion | null>(null);
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<QuestionTypeValue | "">("");
  const [diffFilter, setDiffFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  const savedDetails = useSavedSnapshot({ name, description });
  const savedAccess = useSavedSnapshot([...access].sort());
  useUnsavedGuard(canWrite && (savedDetails.dirty || savedAccess.dirty));

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return questions.filter(
      (q) =>
        (!s || q.prompt.toLowerCase().includes(s)) &&
        (!typeFilter || q.type === typeFilter) &&
        (!diffFilter || (diffFilter === "none" ? !q.difficulty : q.difficulty === diffFilter)) &&
        (!tagFilter || q.tagIds.includes(tagFilter))
    );
  }, [questions, search, typeFilter, diffFilter, tagFilter]);

  const stats = useMemo(() => {
    const byType = new Map<string, number>();
    for (const q of questions) byType.set(q.type, (byType.get(q.type) ?? 0) + 1);
    const points = questions.reduce((s, q) => s + q.points, 0);
    return { byType, points };
  }, [questions]);

  async function saveDetails() {
    setError(null);
    const res = await apiPatch(`/api/tenant/question-banks/${id}`, {
      name: name.trim(),
      description: description.trim() === "" ? null : description,
    });
    if (res.error) return setError(res.error.message);
    savedDetails.markSaved();
    toast("Question bank saved");
    router.refresh();
  }

  async function saveAccess() {
    setError(null);
    const res = await apiPost(`/api/tenant/question-banks/${id}/access`, { userGroupIds: [...access] });
    if (res.error) return setError(res.error.message);
    savedAccess.markSaved();
    toast("Sharing updated");
    router.refresh();
  }

  async function createTag(tagName: string): Promise<Tag | null> {
    const res = await apiPost<{ tag: Tag }>("/api/tenant/question-tags", { name: tagName });
    if (res.error) {
      toast(res.error.message);
      return null;
    }
    const tag = res.data!.tag;
    setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
    return tag;
  }

  async function saveQuestion(payload: EditorPayload): Promise<string | null> {
    setSaving(true);
    try {
      const existingId = editing && "id" in editing ? editing.id : undefined;
      if (!existingId) {
        const res = await apiPost<{ question: { id: string }; duplicates: number }>(`/api/tenant/question-banks/${id}/questions`, payload);
        if (res.error) return res.error.message;
        setQuestions((prev) => [{ ...payload, id: res.data!.question.id, usage: 0 }, ...prev]);
        toast(res.data!.duplicates > 0 ? "Saved — note: a question with the same wording is already in this bank" : "Question added");
      } else {
        const res = await apiPatch(`/api/tenant/questions/${existingId}`, payload);
        if (res.error) return res.error.message;
        setQuestions((prev) => prev.map((q) => (q.id === existingId ? { ...q, ...payload } : q)));
        toast("Question saved");
      }
      setEditing(null);
      router.refresh();
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuestion(q: BankQuestion) {
    const yes = await confirm({
      title: "Delete this question?",
      description: (
        <>
          <span className="mb-2 block font-bold text-foreground">“{q.prompt.slice(0, 140)}{q.prompt.length > 140 ? "…" : ""}”</span>
          {q.usage > 0 ? `It is used in ${q.usage} quiz${q.usage === 1 ? "" : "zes"} or exams and will disappear from them. ` : ""}This cannot be undone.
        </>
      ),
      confirmLabel: "Delete question",
      destructive: true,
    });
    if (!yes) return;
    const res = await apiDelete(`/api/tenant/questions/${q.id}`);
    if (res.error) return setError(res.error.message);
    setQuestions((prev) => prev.filter((x) => x.id !== q.id));
    toast("Question deleted");
  }

  function duplicate(q: BankQuestion) {
    const { id: _id, usage: _u, ...rest } = q;
    void _id;
    void _u;
    setEditing({ ...structuredClone(rest), prompt: q.prompt });
  }

  async function deleteBank() {
    const yes = await confirm({
      title: `Delete “${name.trim() || initial.name}”?`,
      description:
        questions.length > 0
          ? `The bank and its ${questions.length} ${questions.length === 1 ? "question" : "questions"} are deleted, and those questions disappear from any quiz or exam that uses them. This cannot be undone.`
          : "The bank is deleted. This cannot be undone.",
      confirmLabel: "Delete bank",
      destructive: true,
    });
    if (!yes) return;
    const res = await apiDelete(`/api/tenant/question-banks/${id}`);
    if (res.error) return setError(res.error.message);
    toast("Question bank deleted");
    router.push("/admin/question-banks");
  }

  const typeOptions = allQuestionTypes().map((t) => ({ value: t.type, label: t.label }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[14px] border-2 border-border bg-card p-4">
          <div className="text-xs font-black uppercase text-muted-foreground">Questions</div>
          <div className="num mt-1 text-2xl font-black">{questions.length}</div>
        </div>
        <div className="rounded-[14px] border-2 border-border bg-card p-4">
          <div className="text-xs font-black uppercase text-muted-foreground">Total points</div>
          <div className="num mt-1 text-2xl font-black">{stats.points}</div>
        </div>
        <div className="rounded-[14px] border-2 border-border bg-card p-4">
          <div className="text-xs font-black uppercase text-muted-foreground">Types</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[...stats.byType.entries()].map(([t, n]) => (
              <Badge key={t} className="text-[11px]">
                {questionType(t as QuestionTypeValue).label} · {n}
              </Badge>
            ))}
            {stats.byType.size === 0 ? <span className="text-sm text-muted-foreground">—</span> : null}
          </div>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg leading-tight">
            Questions <span className="num text-muted-foreground">({visible.length}{visible.length !== questions.length ? ` of ${questions.length}` : ""})</span>
          </h2>
          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => setEditing(blankQuestion())}>
                Add question
              </Button>
            </div>
          ) : null}
        </div>

        {questions.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput aria-label="Search questions" placeholder="Search questions…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <SelectInput aria-label="Filter by type" placeholder="All types" options={typeOptions} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as QuestionTypeValue | "")} />
            <SelectInput
              aria-label="Filter by difficulty"
              placeholder="Any difficulty"
              options={[
                { value: "EASY", label: "Easy" },
                { value: "MEDIUM", label: "Medium" },
                { value: "HARD", label: "Hard" },
                { value: "none", label: "Not set" },
              ]}
              value={diffFilter}
              onChange={(e) => setDiffFilter(e.target.value)}
            />
            <SelectInput aria-label="Filter by tag" placeholder="Any tag" options={tags.map((t) => ({ value: t.id, label: t.name }))} value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} />
          </div>
        ) : null}

        {questions.length === 0 ? (
          <EmptyState
            icon="clipboard"
            title="No questions yet"
            action={
              canWrite ? (
                <Button type="button" size="sm" onClick={() => setEditing(blankQuestion())}>
                  Add question
                </Button>
              ) : undefined
            }
          >
            Write questions of any type here, import them from a file, or let AI draft them for you to check. They can then be used in any quiz or exam.
          </EmptyState>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {visible.map((q, i) => (
              <li key={q.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 rounded-[10px] border-2 border-border bg-card px-3 py-2.5">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="line-clamp-2 text-sm font-bold text-foreground">
                    <span className="num mr-1.5 text-muted-foreground">{i + 1}.</span>
                    <MathText>{q.prompt || "—"}</MathText>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge>{questionType(q.type).label}</Badge>
                    {q.difficulty ? <Badge>{DIFFICULTY_LABEL[q.difficulty]}</Badge> : null}
                    <span>{q.points} pt</span>
                    {q.partialCredit ? <span>· partial credit</span> : null}
                    {q.media ? <span>· {q.media.kind}</span> : null}
                    {q.groupId ? <span>· passage</span> : null}
                    {q.explanation ? <span>· explained</span> : null}
                    {q.usage > 0 ? <span>· used in {q.usage}</span> : null}
                    {q.tagIds.map((t) => {
                      const tag = tags.find((x) => x.id === t);
                      return tag ? <span key={t}>· #{tag.name}</span> : null;
                    })}
                  </div>
                </div>
                {canWrite ? (
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(structuredClone(q))}>
                      Edit
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => duplicate(q)}>
                      Duplicate
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => deleteQuestion(q)}>
                      Delete
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canWrite ? (
        <BankImport
          bankId={id}
          aiEnabled={aiEnabled}
          onImported={() => {
            toast("Questions added");
            router.refresh();
          }}
        />
      ) : null}

      <BankPassages bankId={id} passages={passages} onChange={setPassages} canWrite={canWrite} />

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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" onClick={saveDetails}>
                Save changes
              </Button>
              <Button type="button" variant="destructive" onClick={deleteBank}>
                Delete bank
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      {canWrite ? (
        <Card>
          <h2 className="font-heading text-lg leading-tight">Who can use this bank</h2>
          <p className="mt-1 text-[13px] font-medium text-muted-foreground">
            Pick staff groups to limit the bank to them. With none picked, every staff member who can work with quizzes can use it.
          </p>
          {groups.length === 0 ? (
            <p className="mt-3 text-sm font-medium text-muted-foreground">There are no staff groups yet, so the bank is open to all staff who can work with quizzes.</p>
          ) : (
            <>
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
                      className={`min-h-9 rounded-full border-2 border-border px-3 py-1 text-sm font-bold outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground hover:bg-muted"}`}
                    >
                      {on ? "✓ " : ""}
                      {g.name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3">
                <Button type="button" variant="outline" onClick={saveAccess}>
                  Save sharing
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="sm:max-w-[min(1200px,96vw)]">
          <SheetHeader>
            <SheetTitle>{editing && "id" in editing && editing.id ? "Edit question" : "New question"}</SheetTitle>
            <SheetDescription>Pick a type, write it, and try it in the preview exactly as a candidate will see it.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            {editing ? (
              <QuestionEditor
                key={"id" in editing && editing.id ? editing.id : "new"}
                initial={editing}
                tags={tags}
                passages={passages.map((p) => ({ id: p.id, title: p.title }))}
                examContext
                onCreateTag={createTag}
                onSave={saveQuestion}
                onCancel={() => setEditing(null)}
                saving={saving}
              />
            ) : null}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
