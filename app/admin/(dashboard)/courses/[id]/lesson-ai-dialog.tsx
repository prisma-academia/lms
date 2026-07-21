"use client";

import { useState } from "react";
import { apiPatch, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormField, TextArea } from "@/components/form-field";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/ui/toast";
import type { GeneratedLesson } from "@/lib/schemas/course-builder";
import type { LessonRow } from "./course-types";

/** Per-lesson AI generation — TEXT and HTML lessons only (quiz/media generation
    happens through the course-level builder, which can create the quiz rows). */
export function LessonAiDialog({
  courseId,
  lesson,
  open,
  onOpenChange,
  onApplied,
}: {
  courseId: string;
  lesson: LessonRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: (lesson: LessonRow) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The form mounts fresh on every open (Radix unmounts closed content),
          so its state resets without effects. */}
      {open && lesson ? (
        <LessonAiForm
          key={lesson.id}
          courseId={courseId}
          lesson={lesson}
          onOpenChange={onOpenChange}
          onApplied={onApplied}
        />
      ) : null}
    </Dialog>
  );
}

function LessonAiForm({
  courseId,
  lesson,
  onOpenChange,
  onApplied,
}: {
  courseId: string;
  lesson: LessonRow;
  onOpenChange: (open: boolean) => void;
  onApplied: (lesson: LessonRow) => void;
}) {
  const { toast } = useToast();
  const [instructions, setInstructions] = useState("");
  const [generated, setGenerated] = useState<GeneratedLesson | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatedBody =
    generated == null ? "" : (lesson.contentType === "HTML" ? generated.html : generated.body) ?? "";

  async function generate() {
    setError(null);
    setGenerating(true);
    const res = await apiPost<{ lesson: GeneratedLesson }>(
      `/api/tenant/courses/${courseId}/lessons/${lesson.id}/generate`,
      { instructions: instructions.trim() || null }
    );
    setGenerating(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.lesson) setGenerated(res.data.lesson);
  }

  async function apply() {
    if (!generated) return;
    setError(null);
    setApplying(true);
    const res = await apiPatch<{ lesson: LessonRow }>(
      `/api/tenant/courses/${courseId}/lessons/${lesson.id}`,
      {
        contentJson:
          lesson.contentType === "HTML" ? { html: generatedBody } : { body: generatedBody },
        ...(generated.durationMin != null && lesson.durationMin == null
          ? { durationMin: generated.durationMin }
          : {}),
      }
    );
    setApplying(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.lesson) {
      toast("Lesson content updated.");
      onApplied(res.data.lesson);
      onOpenChange(false);
    }
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogTitle>Generate lesson content</DialogTitle>
      <DialogDescription>
        Write &ldquo;{lesson.title}&rdquo; with AI, using the course outline as context. Applying
        replaces this lesson&rsquo;s current content.
      </DialogDescription>

      <div className="mt-5 flex flex-col gap-4">
        <FormField
          label="Instructions (optional)"
          htmlFor="lesson-ai-instructions"
          hint="Anything the lesson should emphasize, include, or avoid."
        >
          <TextArea
            id="lesson-ai-instructions"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. include a worked example and a short summary"
          />
        </FormField>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center gap-3">
          <Button onClick={generate} disabled={generating || applying}>
            {generating ? "Generating…" : generated ? "Regenerate" : "Generate"}
          </Button>
          {generating ? <Spinner label="Writing lesson…" /> : null}
        </div>

        {generated ? (
          <div className="rounded-[14px] border-2 border-border bg-background p-4">
            <h3 className="text-sm font-semibold uppercase text-stone-500">Preview</h3>
            <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm font-medium text-foreground">
              {generatedBody || "(empty)"}
            </pre>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-destructive">
                Applying overwrites the lesson&rsquo;s current content.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setGenerated(null)} disabled={applying}>
                  Discard
                </Button>
                <Button onClick={apply} disabled={applying || !generatedBody}>
                  {applying ? "Applying…" : "Apply to lesson"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </DialogContent>
  );
}
