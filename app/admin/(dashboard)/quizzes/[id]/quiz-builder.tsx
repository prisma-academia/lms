"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField, TextInput, TextArea } from "@/components/form-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useSavedSnapshot, useUnsavedGuard } from "@/components/use-unsaved-guard";
import type { QuizSourceCourse } from "@/lib/assessments/quiz-sources";

/** Where a question's answer is taught: a lesson, and optionally a heading in it. */
export type QuestionSource = { lessonId: string; anchor: string | null };

export type Candidate = {
  id: string;
  prompt: string;
  type: string;
  bank: string;
  defaultPoints: number;
  hasHint: boolean;
  source: QuestionSource | null;
};

export type SelectedQ = {
  questionId: string;
  prompt: string;
  type: string;
  points: number;
  hasHint: boolean;
  source: QuestionSource | null;
};

const SELECT_CLASS =
  "min-w-0 flex-1 basis-48 rounded-[8px] border-2 border-border bg-card px-2 py-1.5 text-[13px] font-medium text-card-foreground outline-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60";

function sameSource(a: QuestionSource | null, b: QuestionSource | null): boolean {
  return (a?.lessonId ?? null) === (b?.lessonId ?? null) && (a?.anchor ?? null) === (b?.anchor ?? null);
}

/**
 * Pick the lesson — and, if it has headings, the heading — a question's answer
 * is taught under. A learner who gets the question wrong is sent there.
 */
function SourcePicker({
  courses,
  value,
  onChange,
  disabled,
}: {
  courses: QuizSourceCourse[];
  value: QuestionSource | null;
  onChange: (next: QuestionSource | null) => void;
  disabled: boolean;
}) {
  const uid = useId();
  const lessons = courses.flatMap((course) =>
    course.lessons.map((lesson) => ({
      ...lesson,
      // Only worth saying which course when the quiz is used in more than one.
      label: courses.length > 1 ? `${course.title} — ${lesson.title}` : lesson.title,
    }))
  );
  const lesson = value ? lessons.find((l) => l.id === value.lessonId) : undefined;
  // A source that points outside these courses (the question is shared with
  // another course) is shown as such instead of silently reading as "none".
  const elsewhere = value != null && !lesson;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`${uid}-lesson`} className="shrink-0 text-[12px] font-bold text-muted-foreground">
        Read up in
      </label>
      <select
        id={`${uid}-lesson`}
        className={SELECT_CLASS}
        value={value?.lessonId ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value ? { lessonId: e.target.value, anchor: null } : null)}
      >
        <option value="">No lesson chosen</option>
        {elsewhere ? <option value={value.lessonId}>A lesson in another course</option> : null}
        {lessons.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>

      {lesson && lesson.headings.length > 0 ? (
        <>
          <label htmlFor={`${uid}-heading`} className="sr-only">
            Heading in that lesson
          </label>
          <select
            id={`${uid}-heading`}
            className={SELECT_CLASS}
            value={value?.anchor ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ lessonId: lesson.id, anchor: e.target.value || null })}
          >
            <option value="">The whole lesson</option>
            {lesson.headings.map((h) => (
              <option key={h.id} value={h.id}>
                {h.level > 2 ? "— " : ""}
                {h.text}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  );
}

export function QuizBuilder({
  id,
  initial,
  selectedQuestions,
  candidates,
  sourceCourses,
  canWrite,
}: {
  id: string;
  initial: {
    title: string;
    description: string;
    passingScore: string;
    timeLimitMin: string;
    hintsEnabled: boolean;
    showReviewLinks: boolean;
  };
  selectedQuestions: SelectedQ[];
  candidates: Candidate[];
  /** Courses this quiz is attached to, with the lessons a question can point at. */
  sourceCourses: QuizSourceCourse[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const uid = useId();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [passingScore, setPassingScore] = useState(initial.passingScore);
  const [timeLimit, setTimeLimit] = useState(initial.timeLimitMin);
  const [hintsEnabled, setHintsEnabled] = useState(initial.hintsEnabled);
  const [showReviewLinks, setShowReviewLinks] = useState(initial.showReviewLinks);
  const [selected, setSelected] = useState<SelectedQ[]>(selectedQuestions);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Closing or reloading the tab over unsaved changes asks first. Everything
  // Save writes is in here — details, the question list in order with its
  // points, and where each question is taught; the search box is not.
  const saved = useSavedSnapshot({
    title,
    description,
    passingScore,
    timeLimit,
    hintsEnabled,
    showReviewLinks,
    questions: selected.map((s) => [s.questionId, s.points, s.source?.lessonId ?? null, s.source?.anchor ?? null]),
  });
  useUnsavedGuard(canWrite && saved.dirty);

  /** Sources as last saved, so only the questions that changed are written. */
  const savedSources = useMemo(() => {
    const map = new Map<string, QuestionSource | null>();
    for (const c of candidates) map.set(c.id, c.source);
    for (const s of selectedQuestions) map.set(s.questionId, s.source);
    return map;
  }, [candidates, selectedQuestions]);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.questionId)), [selected]);
  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((c) => !selectedIds.has(c.id) && (q === "" || c.prompt.toLowerCase().includes(q)));
  }, [candidates, selectedIds, query]);

  const hasSources = sourceCourses.some((course) => course.lessons.length > 0);
  const withoutSource = selected.filter((s) => !s.source).length;

  function move(index: number, dir: -1 | 1) {
    setSelected((prev) => {
      const next = [...prev];
      const t = index + dir;
      if (t < 0 || t >= next.length) return prev;
      [next[index], next[t]] = [next[t], next[index]];
      return next;
    });
  }

  function setSource(questionId: string, source: QuestionSource | null) {
    setSelected((prev) => prev.map((s) => (s.questionId === questionId ? { ...s, source } : s)));
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
        hintsEnabled,
        showReviewLinks,
      });
      if (details.error) return setError(details.error.message);

      const qs = await apiPost(`/api/tenant/quizzes/${id}/questions`, {
        questions: selected.map((s, idx) => ({ questionId: s.questionId, sortOrder: idx, points: s.points })),
      });
      if (qs.error) return setError(qs.error.message);

      // A source belongs to the question, not to its place in this quiz, so it
      // is saved on the question — and only where it actually changed.
      for (const s of selected) {
        if (sameSource(s.source, savedSources.get(s.questionId) ?? null)) continue;
        const res = await apiPatch(`/api/tenant/questions/${s.questionId}`, { source: s.source });
        if (res.error) {
          return setError(`Could not save where “${s.prompt.slice(0, 60)}” is taught: ${res.error.message}`);
        }
      }

      saved.markSaved();
      setInfo("Saved.");
      toast("Quiz saved");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    const yes = await confirm({
      title: `Delete “${title.trim() || initial.title}”?`,
      description:
        "The quiz and every learner's attempts at it are deleted. Its questions stay in their question banks. This cannot be undone.",
      confirmLabel: "Delete quiz",
      destructive: true,
    });
    if (!yes) return;
    const res = await apiDelete(`/api/tenant/quizzes/${id}`);
    if (res.error) return setError(res.error.message);
    toast("Quiz deleted");
    router.push("/admin/quizzes");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Quiz details</h2>
        <div className="mt-4 flex max-w-xl flex-col gap-4">
          <FormField label="Title" htmlFor="q-title">
            <TextInput id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canWrite} />
          </FormField>
          <FormField label="Description" htmlFor="q-desc">
            <TextArea id="q-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite} />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="Pass mark (%)"
              htmlFor="q-pass"
              hint="The score a learner needs to move on. Leave empty to require every answer correct (100%)."
            >
              <TextInput id="q-pass" type="number" inputMode="numeric" min="0" max="100" placeholder="100" value={passingScore} onChange={(e) => setPassingScore(e.target.value)} disabled={!canWrite} />
            </FormField>
            <FormField label="Time limit (min)" htmlFor="q-time">
              <TextInput id="q-time" type="number" min="1" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} disabled={!canWrite} />
            </FormField>
          </div>
          {/* A written answer is marked on a four-point scale per criterion, so
              100% means "fully met" on every criterion of every essay. That is a
              bar worth choosing on purpose, not arriving at by leaving a field
              empty. */}
          {selected.some((q) => q.type === "ESSAY") &&
          (!passingScore.trim() || parseInt(passingScore, 10) >= 100) ? (
            <p
              role="note"
              className="rounded-[10px] border-2 border-warning bg-warning/15 px-3 py-2 text-[13px] font-medium text-foreground"
            >
              This quiz has written answers and a pass mark of 100%. A learner will need full marks
              on every rubric criterion to move on. Consider a lower pass mark, such as 70%.
            </p>
          ) : null}

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[13px] font-bold text-foreground">Help for learners</legend>
            <div className="flex items-start gap-2.5">
              <Checkbox
                id={`${uid}-hints`}
                checked={hintsEnabled}
                onCheckedChange={(v) => setHintsEnabled(v === true)}
                disabled={!canWrite}
                className="mt-0.5"
              />
              <label htmlFor={`${uid}-hints`} className="text-sm font-medium">
                Let learners reveal hints
                <span className="block text-xs font-medium text-muted-foreground">
                  Shown only for questions that have a hint, and only when the learner asks. Hints
                  are written on each question in its question bank.
                </span>
              </label>
            </div>
            <div className="flex items-start gap-2.5">
              <Checkbox
                id={`${uid}-review`}
                checked={showReviewLinks}
                onCheckedChange={(v) => setShowReviewLinks(v === true)}
                disabled={!canWrite}
                className="mt-0.5"
              />
              <label htmlFor={`${uid}-review`} className="text-sm font-medium">
                After a failed attempt, show which questions to review
                <span className="block text-xs font-medium text-muted-foreground">
                  Names the questions that were wrong and links each to the lesson it is taught in.
                  It never shows the correct answer.
                </span>
              </label>
            </div>
          </fieldset>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Questions in this quiz</h2>

        {showReviewLinks && selected.length > 0 ? (
          <p className="mt-2 text-[13px] font-medium text-muted-foreground">
            {hasSources
              ? withoutSource === 0
                ? "Every question says where it is taught."
                : `${withoutSource} of ${selected.length} questions ${
                    withoutSource === 1 ? "has" : "have"
                  } no lesson chosen — a learner who gets ${
                    withoutSource === 1 ? "it" : "one of them"
                  } wrong is told so, but has no link to follow.`
              : "To link questions to the lessons they are taught in, add this quiz to a course as a quiz lesson first."}
          </p>
        ) : null}

        {selected.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No questions added yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {selected.map((s, idx) => (
              <li key={s.questionId} className="rounded-[10px] border-2 border-border bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-sm text-foreground">
                    <span className="block truncate">
                      {idx + 1}. {s.prompt}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge>{s.points} pt</Badge>
                      {s.hasHint ? <Badge>Has a hint</Badge> : null}
                    </span>
                  </span>
                  {canWrite ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="outline" size="sm" aria-label={`Move question ${idx + 1} up`} onClick={() => move(idx, -1)}>↑</Button>
                      <Button type="button" variant="outline" size="sm" aria-label={`Move question ${idx + 1} down`} onClick={() => move(idx, 1)}>↓</Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        aria-label={`Remove question ${idx + 1} from this quiz`}
                        onClick={() => setSelected((prev) => prev.filter((x) => x.questionId !== s.questionId))}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </div>
                {hasSources || s.source ? (
                  <div className="mt-2 border-t border-dashed border-border pt-2">
                    <SourcePicker
                      courses={sourceCourses}
                      value={s.source}
                      onChange={(next) => setSource(s.questionId, next)}
                      disabled={!canWrite}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canWrite ? (
          <div className="mt-6 border-t-2 border-dashed border-border pt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-foreground">Add questions</h3>
              <label htmlFor={`${uid}-search`} className="sr-only">
                Search questions
              </label>
              <input
                id={`${uid}-search`}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search questions…"
                className="rounded-[10px] border-2 border-border bg-card px-3 py-1.5 text-sm outline-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-[10px] border-2 border-border">
              {available.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No more questions to add.</p>
              ) : (
                available.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {c.prompt} <span className="text-xs text-muted-foreground">({c.bank})</span>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSelected((prev) => [
                          ...prev,
                          {
                            questionId: c.id,
                            prompt: c.prompt,
                            type: c.type,
                            points: c.defaultPoints,
                            hasHint: c.hasHint,
                            source: c.source,
                          },
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

      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="text-sm font-medium text-muted-foreground">
          {info}
        </p>
      ) : null}

      {canWrite ? (
        // The destructive action sits apart from the primary one.
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          <Button type="button" variant="destructive" onClick={onDelete} disabled={saving}>Delete quiz</Button>
        </div>
      ) : null}
    </div>
  );
}
