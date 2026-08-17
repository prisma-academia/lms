"use client";

import { useState } from "react";
import { apiPatch, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  GenerationProgressModal,
  INITIAL_GENERATION_PROGRESS,
  type GenerationProgressState,
} from "@/components/generation-progress-modal";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/icon";
import type { GeneratedLesson } from "@/lib/schemas/course-builder";
import {
  CONTENT_TYPE_OPTIONS,
  bodyFieldLabel,
  getLessonBody,
  type LessonContentType,
  type LessonGroupRow,
  type LessonRow,
} from "./course-types";

export function buildContentJson(type: LessonContentType, body: string, quizId: string) {
  return type === "TEXT"
    ? { body }
    : type === "HTML"
      ? { html: body }
      : type === "VIDEO_URL"
        ? { url: body }
        : type === "QUIZ"
          ? { quizId }
          : {};
}

/**
 * What the timer actually does for this content type, in the author's terms.
 * The exact number is computed server-side from the lesson body (see
 * `requiredDwellSeconds`), so this describes the rule rather than promising a
 * duration the author would then expect to be able to edit.
 */
function dwellHint(type: LessonContentType): string {
  if (type === "QUIZ") return "Quizzes are gated by scoring 100%, so no timer is applied.";
  if (type === "TEXT" || type === "HTML")
    return "Scaled to the length of the content, between 15 seconds and 3 minutes.";
  return "Half the stated duration, between 15 seconds and 2 minutes.";
}

type LessonDialogProps = {
  courseId: string;
  /** Null = create a new lesson. */
  lesson: LessonRow | null;
  groups: LessonGroupRow[];
  quizzes: { id: string; title: string }[];
  libraryItems: { id: string; name: string; key: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (lesson: LessonRow, isNew: boolean) => void;
};

export function LessonDialog({ open, onOpenChange, lesson, ...props }: LessonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The form mounts fresh on every open (Radix unmounts closed content),
          so its state seeds from the lesson prop without effects. */}
      {open ? (
        <LessonForm
          key={lesson?.id ?? "new"}
          lesson={lesson}
          onOpenChange={onOpenChange}
          {...props}
        />
      ) : null}
    </Dialog>
  );
}

function LessonForm({
  courseId,
  lesson,
  groups,
  quizzes,
  libraryItems,
  onOpenChange,
  onSaved,
}: Omit<LessonDialogProps, "open">) {
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [type, setType] = useState<LessonContentType>(lesson?.contentType ?? "TEXT");
  const [body, setBody] = useState(lesson ? getLessonBody(lesson) : "");
  const [duration, setDuration] = useState(
    lesson?.durationMin != null ? String(lesson.durationMin) : ""
  );
  const [groupId, setGroupId] = useState(lesson?.groupId ?? "");
  // Defaults to on for a new lesson, and for a row loaded before the column
  // existed — `?? true` matches the schema default rather than inventing one.
  const [requireDwell, setRequireDwell] = useState(lesson?.requireDwell ?? true);
  const [quizId, setQuizId] = useState(
    lesson?.contentType === "QUIZ" && typeof lesson.contentJson.quizId === "string"
      ? lesson.contentJson.quizId
      : ""
  );
  const [libraryItemId, setLibraryItemId] = useState(
    lesson?.libraryItemId ??
      (lesson?.contentType === "FILE" && lesson.assetKey
        ? libraryItems.find((i) => i.key === lesson.assetKey)?.id ?? ""
        : "")
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // AI assist (TEXT/HTML only). Generated content lands in a preview the user
  // must explicitly accept — it never overwrites the body field directly.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiProgress, setAiProgress] = useState<GenerationProgressState>(INITIAL_GENERATION_PROGRESS);

  const groupOptions = groups.map((g) => ({ value: g.id, label: g.title }));
  const quizOptions = quizzes.map((q) => ({ value: q.id, label: q.title }));
  const libraryOptions = libraryItems.map((r) => ({ value: r.id, label: r.name }));
  const aiCapable = type === "TEXT" || type === "HTML";

  async function generateWithAi() {
    if (!title.trim()) {
      setAiError("Give the lesson a title first — the AI writes content for it.");
      return;
    }
    setAiError(null);
    setAiGenerating(true);
    setAiProgress({
      open: true,
      percent: 10,
      label: "Preparing…",
      error: null,
      running: true,
    });

    // Stepped progress while the blocking generate call runs (no workflow stream).
    const timers = [
      window.setTimeout(() => {
        setAiProgress((p) =>
          p.running ? { ...p, percent: 35, label: "Writing lesson…" } : p
        );
      }, 600),
      window.setTimeout(() => {
        setAiProgress((p) =>
          p.running ? { ...p, percent: 70, label: "Finishing…" } : p
        );
      }, 2500),
    ];

    const res = await apiPost<{ lesson: GeneratedLesson }>(
      `/api/tenant/courses/${courseId}/lessons/generate`,
      {
        title: title.trim(),
        contentType: type,
        instructions: aiInstructions.trim() || null,
      }
    );

    for (const t of timers) window.clearTimeout(t);
    setAiGenerating(false);

    if (res.error) {
      setAiProgress({
        open: true,
        percent: 0,
        label: "",
        error: res.error.message,
        running: false,
      });
      setAiError(res.error.message);
      return;
    }
    const gen = res.data?.lesson;
    const content = (type === "HTML" ? gen?.html : gen?.body) ?? "";
    if (!content) {
      const msg = "The AI returned no content — try again.";
      setAiProgress({ open: true, percent: 0, label: "", error: msg, running: false });
      setAiError(msg);
      return;
    }
    setAiProgress({
      open: false,
      percent: 100,
      label: "Done",
      error: null,
      running: false,
    });
    setAiPreview(content);
  }

  async function save() {
    if (!title.trim()) {
      setError("Lesson title is required.");
      return;
    }
    if (type === "QUIZ" && !quizId) {
      setError("Select a quiz for this lesson.");
      return;
    }
    if (type === "FILE" && !libraryItemId) {
      setError("Select a library file for this lesson.");
      return;
    }
    setError(null);
    setPending(true);

    const payload = {
      title: title.trim(),
      contentType: type,
      contentJson: buildContentJson(type, body, quizId),
      assetKey: null as string | null,
      libraryItemId: type === "FILE" ? libraryItemId || null : null,
      durationMin: duration.trim() ? parseInt(duration, 10) : null,
      requireDwell,
      groupId: groupId || null,
    };

    const res = lesson
      ? await apiPatch<{ lesson: LessonRow }>(
          `/api/tenant/courses/${courseId}/lessons/${lesson.id}`,
          payload
        )
      : await apiPost<{ lesson: LessonRow }>(`/api/tenant/courses/${courseId}/lessons`, payload);
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.lesson) {
      onSaved(res.data.lesson, !lesson);
      onOpenChange(false);
    }
  }

  return (
    <>
      <GenerationProgressModal
        title="Writing lesson"
        state={aiProgress}
        onClose={() => setAiProgress(INITIAL_GENERATION_PROGRESS)}
        onRetry={() => {
          setAiProgress(INITIAL_GENERATION_PROGRESS);
          void generateWithAi();
        }}
      />
      <DialogContent className="max-w-2xl">
      <DialogTitle>{lesson ? "Edit lesson" : "Add lesson"}</DialogTitle>
      <DialogDescription>
        {lesson
          ? "Update this lesson's title, content and placement."
          : "Create a new lesson in this course."}
      </DialogDescription>

      <div className="mt-5 flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_190px]">
          <FormField label="Title" htmlFor="lesson-dialog-title">
            <TextInput
              id="lesson-dialog-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Introduction to variables"
            />
          </FormField>
          <FormField label="Content type" htmlFor="lesson-dialog-type">
            <SelectInput
              id="lesson-dialog-type"
              allowEmpty={false}
              options={CONTENT_TYPE_OPTIONS}
              value={type}
              onChange={(e) => {
                setType(e.target.value as LessonContentType);
                setAiPreview(null);
                setAiError(null);
              }}
            />
          </FormField>
        </div>

        {type === "QUIZ" ? (
          <FormField label="Quiz" htmlFor="lesson-dialog-quiz">
            {quizOptions.length > 0 ? (
              <SelectInput
                id="lesson-dialog-quiz"
                placeholder="Select a quiz…"
                options={quizOptions}
                value={quizId}
                onChange={(e) => setQuizId(e.target.value)}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                No quizzes yet — create one under Quizzes first.
              </p>
            )}
          </FormField>
        ) : type === "FILE" ? (
          <FormField label="Library file" htmlFor="lesson-dialog-library">
            {libraryOptions.length > 0 ? (
              <SelectInput
                id="lesson-dialog-library"
                placeholder="Select a file…"
                options={libraryOptions}
                value={libraryItemId}
                onChange={(e) => setLibraryItemId(e.target.value)}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                No library items yet — upload one under Library first.
              </p>
            )}
          </FormField>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-foreground">{bodyFieldLabel(type)}</span>
              {aiCapable ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setAiOpen((o) => !o)}
                  aria-expanded={aiOpen}
                >
                  <Icon name="sparkles" />
                  Write with AI
                </Button>
              ) : null}
            </div>
            {type === "TEXT" || type === "HTML" ? (
              <TextArea
                id="lesson-dialog-body"
                rows={7}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            ) : (
              <TextInput
                id="lesson-dialog-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            )}
          </div>
        )}

        {aiCapable && aiOpen ? (
          <div className="rounded-[10px] border-2 border-dashed border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <Icon name="sparkles" className="size-4 text-muted-foreground" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                AI assist
              </h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Writes the {type === "HTML" ? "HTML" : "text"} for &ldquo;
              {title.trim() || "your lesson"}&rdquo; using the course outline as context. Review the
              preview, then choose whether to use it.
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <FormField
                label="Instructions (optional)"
                htmlFor="lesson-dialog-ai-instructions"
                hint="Anything the lesson should emphasize, include, or avoid."
              >
                <TextInput
                  id="lesson-dialog-ai-instructions"
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                  placeholder="e.g. include a worked example and a short summary"
                />
              </FormField>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  onClick={generateWithAi}
                  disabled={aiGenerating || pending}
                >
                  {aiGenerating ? "Generating…" : aiPreview ? "Regenerate" : "Generate"}
                </Button>
              </div>
              {aiError ? <p className="text-sm text-red-600">{aiError}</p> : null}

              {aiPreview ? (
                <div className="rounded-[10px] border-2 border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Preview
                    </h4>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => setAiPreview(null)}
                      >
                        Discard
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        onClick={() => {
                          setBody(aiPreview);
                          setAiPreview(null);
                          setAiOpen(false);
                        }}
                      >
                        <Icon name="check" />
                        Use this content
                      </Button>
                    </div>
                  </div>
                  <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-sm font-medium text-foreground">
                    {aiPreview}
                  </pre>
                  {body.trim() ? (
                    <p className="mt-2 text-xs font-medium text-destructive">
                      &ldquo;Use this content&rdquo; replaces the current {bodyFieldLabel(type).toLowerCase()}.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <label
          htmlFor="lesson-dialog-dwell"
          className="flex items-start gap-3 rounded-[10px] border-2 border-border bg-background p-3"
        >
          <Checkbox
            id="lesson-dialog-dwell"
            checked={requireDwell}
            onCheckedChange={(v) => setRequireDwell(v === true)}
            className="mt-0.5"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-bold text-foreground">
              Require minimum time on this lesson
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {requireDwell
                ? dwellHint(type)
                : "No timer — learners can mark this complete as soon as they have read, watched or passed it."}
            </span>
          </span>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Duration (minutes)" htmlFor="lesson-dialog-duration">
            <TextInput
              id="lesson-dialog-duration"
              type="number"
              min="0"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </FormField>
          <FormField label="Group (optional)" htmlFor="lesson-dialog-group">
            <SelectInput
              id="lesson-dialog-group"
              placeholder="Ungrouped"
              options={groupOptions}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            />
          </FormField>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex justify-end gap-2 border-t-2 border-dashed border-border pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || aiGenerating}>
            {pending ? "Saving…" : lesson ? "Save lesson" : "Add lesson"}
          </Button>
        </div>
        </div>
      </DialogContent>
    </>
  );
}
