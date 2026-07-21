"use client";

import { useState } from "react";
import { apiPatch, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { Spinner } from "@/components/spinner";
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
  const [quizId, setQuizId] = useState(
    lesson?.contentType === "QUIZ" && typeof lesson.contentJson.quizId === "string"
      ? lesson.contentJson.quizId
      : ""
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

  const groupOptions = groups.map((g) => ({ value: g.id, label: g.title }));
  const quizOptions = quizzes.map((q) => ({ value: q.id, label: q.title }));
  const libraryOptions = libraryItems.map((r) => ({ value: r.key, label: r.name }));
  const aiCapable = type === "TEXT" || type === "HTML";

  async function generateWithAi() {
    if (!title.trim()) {
      setAiError("Give the lesson a title first — the AI writes content for it.");
      return;
    }
    setAiError(null);
    setAiGenerating(true);
    const res = await apiPost<{ lesson: GeneratedLesson }>(
      `/api/tenant/courses/${courseId}/lessons/generate`,
      {
        title: title.trim(),
        contentType: type,
        instructions: aiInstructions.trim() || null,
      }
    );
    setAiGenerating(false);
    if (res.error) {
      setAiError(res.error.message);
      return;
    }
    const gen = res.data?.lesson;
    const content = (type === "HTML" ? gen?.html : gen?.body) ?? "";
    if (!content) {
      setAiError("The AI returned no content — try again.");
      return;
    }
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
    setError(null);
    setPending(true);

    const payload = {
      title: title.trim(),
      contentType: type,
      contentJson: buildContentJson(type, body, quizId),
      assetKey: type === "FILE" ? body || null : null,
      durationMin: duration.trim() ? parseInt(duration, 10) : null,
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
                {aiGenerating ? <Spinner label="Writing lesson…" /> : null}
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

        {type === "FILE" && libraryOptions.length > 0 ? (
          <FormField label="Pick from library" htmlFor="lesson-dialog-library">
            <SelectInput
              id="lesson-dialog-library"
              placeholder="Select a file…"
              options={libraryOptions}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </FormField>
        ) : null}

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
  );
}
