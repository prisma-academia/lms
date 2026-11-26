"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { streamPost } from "@/lib/client/stream-post";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { Checkbox } from "@/components/ui/checkbox";
import { Segmented } from "@/components/ui/segmented";
import {
  GenerationProgressModal,
  INITIAL_GENERATION_PROGRESS,
  type GenerationProgressState,
} from "@/components/generation-progress-modal";
import { useToast } from "@/components/ui/toast";
import { BuilderPreviewTree } from "../builder-preview-tree";
import {
  courseTemplateSchema,
  type GeneratedCourse,
} from "@/lib/schemas/course-builder";
import type {
  CourseBuilderProgressEvent,
  CourseBuilderWarningEvent,
} from "@/lib/schemas/course-builder-progress";
import {
  AUDIENCE_PRESETS,
  QUIZ_MODE_OPTIONS,
  serializeAudience,
  serializeStructureHints,
} from "../course-types";

type SourceMode = "prompt" | "import";

type ApplyResult = {
  created: { groups: number; lessons: number; quizzes: number; questions: number };
};

const COUNT_OPTIONS = (min: number, max: number) =>
  Array.from({ length: max - min + 1 }, (_, i) => ({
    value: String(min + i),
    label: String(min + i),
  }));

// Caps mirror generatedCourseSchema (max 15 groups).
const MODULE_OPTIONS = COUNT_OPTIONS(2, 15);
const LESSONS_PER_MODULE_OPTIONS = COUNT_OPTIONS(2, 10);

export function BuilderStudio({
  courseId,
  courseTitle,
  existingLessonCount,
}: {
  courseId: string;
  courseTitle: string;
  existingLessonCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [mode, setMode] = useState<SourceMode>("prompt");
  const [topic, setTopic] = useState("");
  const [audiencePreset, setAudiencePreset] = useState("");
  const [audienceCustom, setAudienceCustom] = useState("");
  const [moduleCount, setModuleCount] = useState("");
  const [lessonsPerModule, setLessonsPerModule] = useState("");
  const [quizMode, setQuizMode] = useState("");
  const [extraHints, setExtraHints] = useState("");
  const [sourceMaterial, setSourceMaterial] = useState("");
  const [allowPlaceholders, setAllowPlaceholders] = useState(false);
  const [allowEssays, setAllowEssays] = useState(false);
  const [importJson, setImportJson] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<GeneratedCourse | null>(null);
  // Lessons the generator had to leave empty and quizzes it had to leave out.
  const [warnings, setWarnings] = useState<CourseBuilderWarningEvent[]>([]);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<GenerationProgressState>(INITIAL_GENERATION_PROGRESS);
  /** Which request the progress dialog is showing, so "Try again" repeats the right one. */
  const [running, setRunning] = useState<"course" | "quizzes">("course");

  async function readImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportJson(await file.text());
    if (fileRef.current) fileRef.current.value = "";
  }

  function buildGenerateBody() {
    return mode === "import"
      ? {
          mode: "adapt-json" as const,
          topic: topic.trim() || "Course from imported JSON",
          sourceJson: importJson.trim(),
          allowPlaceholders,
          allowEssays,
        }
      : {
          mode: "prompt" as const,
          topic: topic.trim(),
          audience: serializeAudience(audiencePreset, audienceCustom),
          structureHints: serializeStructureHints({
            modules: moduleCount,
            lessonsPerModule,
            quizMode,
            extra: extraHints,
          }),
          sourceMaterial: sourceMaterial.trim() || null,
          allowPlaceholders,
          allowEssays,
        };
  }

  // What the draft on screen was generated from. The form can be changed after
  // generating; quizzes written later must still be for the course that was asked for.
  const [draftRequest, setDraftRequest] = useState<ReturnType<typeof buildGenerateBody> | null>(null);

  /**
   * Run one of the two streaming requests behind the progress dialog. Both send
   * the same events: progress, then `done` with a course, or `error`.
   */
  async function runStream(
    url: string,
    body: unknown,
    labels: { done: string; empty: string },
    onDone: (event: Extract<CourseBuilderProgressEvent, { type: "done" }>) => void
  ) {
    setGenerating(true);
    setProgress({
      open: true,
      percent: 0,
      label: "Starting…",
      error: null,
      running: true,
    });

    let gotCourse = false;
    let streamError: string | null = null;

    const { error: transportError } = await streamPost<CourseBuilderProgressEvent>(url, body, (event) => {
      if (event.type === "progress") {
        setProgress((prev) => ({
          ...prev,
          open: true,
          running: true,
          error: null,
          percent: event.percent,
          label: event.label,
          completed: event.completed,
          total: event.total,
        }));
      } else if (event.type === "error") {
        streamError = event.message;
        setProgress((prev) => ({
          ...prev,
          open: true,
          running: false,
          error: event.message,
        }));
      } else if (event.type === "done") {
        gotCourse = true;
        onDone(event);
        setProgress({
          open: false,
          percent: 100,
          label: labels.done,
          error: null,
          running: false,
        });
      }
    });

    setGenerating(false);

    if (transportError && !gotCourse && !streamError) {
      setProgress((prev) => ({
        ...prev,
        open: true,
        running: false,
        error: transportError,
      }));
      setError(transportError);
      return;
    }
    if (streamError) {
      setError(streamError);
      return;
    }
    if (!gotCourse) {
      setProgress((prev) => ({ ...prev, open: true, running: false, error: labels.empty }));
      setError(labels.empty);
    }
  }

  async function generate() {
    setError(null);

    if (mode === "import") {
      const raw = importJson.trim();
      if (!raw) {
        setError("Choose a course file, or paste its contents, first.");
        return;
      }
      // Exact-template JSON loads straight into the preview — no AI round-trip.
      try {
        const parsed = courseTemplateSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          setWarnings([]);
          setPreview({ courseSummary: parsed.data.courseSummary, groups: parsed.data.groups });
          toast("Course file read. Review the draft, then add it to the course.");
          return;
        }
      } catch {
        // Not JSON at all — let the AI try to make sense of it below.
      }
    } else if (!topic.trim()) {
      setError("Say what the course should teach first.");
      return;
    }

    const request = buildGenerateBody();
    setRunning("course");
    await runStream(
      `/api/tenant/courses/${courseId}/builder/generate`,
      request,
      { done: "Course ready", empty: "Generation finished without a course — try again." },
      (event) => {
        setWarnings(event.warnings ?? []);
        setPreview(event.course);
        setDraftRequest(request);
      }
    );
  }

  // Quizzes the run left out — usually because a long course used its whole
  // time allowance on lessons, and quizzes are written last.
  const missingQuizzes = warnings.filter((w) => w.kind === "quiz");

  /**
   * Write only those quizzes, from the lessons in the draft as it stands, and
   * put them into the draft. Nothing is saved: they are added to the course
   * with everything else, by "Add to course".
   */
  async function generateMissingQuizzes() {
    if (!preview || missingQuizzes.length === 0) return;
    setError(null);

    const quizCount = (course: GeneratedCourse) =>
      course.groups.reduce((sum, g) => sum + g.lessons.filter((l) => l.contentType === "QUIZ").length, 0);
    const before = quizCount(preview);
    const base = draftRequest ?? buildGenerateBody();
    // The new quizzes take the pass mark the draft's other quizzes carry.
    const passMark =
      preview.groups.flatMap((g) => g.lessons).find((l) => l.quiz)?.quiz?.passingScore ?? null;

    setRunning("quizzes");
    await runStream(
      `/api/tenant/courses/${courseId}/builder/quizzes`,
      {
        course: preview,
        missing: missingQuizzes.map((w) => ({ module: w.module, title: w.title })),
        request: {
          ...base,
          topic: base.topic || courseTitle,
          // The quizzes are written from the lessons, not from the source text.
          sourceMaterial: null,
          sourceJson: null,
          quizPassMark: passMark,
        },
      },
      { done: "Quizzes ready", empty: "The quizzes could not be written — try again." },
      (event) => {
        const stillMissing = event.warnings ?? [];
        const written = quizCount(event.course) - before;
        setPreview(event.course);
        setWarnings((prev) => [...prev.filter((w) => w.kind !== "quiz"), ...stillMissing]);
        toast(
          written === 0
            ? "Those quizzes are already in the draft."
            : `${written === 1 ? "1 quiz" : `${written} quizzes`} written and added to the draft.${
                stillMissing.length > 0 ? ` ${stillMissing.length} could not be written.` : ""
              } Review ${written === 1 ? "it" : "them"}, then add the draft to the course.`
        );
      }
    );
  }

  async function apply() {
    if (!preview) return;
    setError(null);
    setApplying(true);
    const res = await apiPost<ApplyResult>(`/api/tenant/courses/${courseId}/builder/apply`, {
      course: preview,
      allowEssays,
    });
    setApplying(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    const c = res.data?.created;
    toast(
      c
        ? `Added ${c.groups} modules, ${c.lessons} lessons${c.quizzes ? `, ${c.quizzes} quizzes (${c.questions} questions)` : ""}.`
        : "Added to the course."
    );
    // Straight to the lessons tab, where what was just added is.
    router.push(`/admin/courses/${courseId}?tab=content`);
    router.refresh();
  }

  const lessonCount = preview
    ? preview.groups.reduce((sum, g) => sum + g.lessons.length, 0)
    : 0;

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <GenerationProgressModal
        title={running === "quizzes" ? "Writing the missing quizzes" : "Generating course"}
        state={progress}
        onClose={() => setProgress(INITIAL_GENERATION_PROGRESS)}
        onRetry={() => {
          setProgress(INITIAL_GENERATION_PROGRESS);
          void (running === "quizzes" ? generateMissingQuizzes() : generate());
        }}
      />

      {/* ---- Config side panel ---- */}
      <div className="lg:sticky lg:top-4">
        <Card>
          <div className="flex items-center gap-2">
            <Icon name="sparkles" className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="font-heading text-lg leading-tight">What to build</h2>
          </div>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            You get a draft to review first. Nothing is added to &ldquo;{courseTitle}&rdquo; until
            you choose to.
          </p>

          <div className="mt-4">
            <Segmented<SourceMode>
              ariaLabel="Builder source"
              options={[
                { value: "prompt", label: "Describe it" },
                { value: "import", label: "Import a file" },
              ]}
              value={mode}
              onChange={setMode}
            />
          </div>

          <div className="mt-4 flex flex-col gap-4">
            {mode === "prompt" ? (
              <>
                <FormField label="Topic" htmlFor="builder-topic" hint="What should this course teach?">
                  <TextInput
                    id="builder-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    autoComplete="off"
                    placeholder="e.g. Practical SQL for data analysts…"
                  />
                </FormField>

                <FormField label="Audience" htmlFor="builder-audience">
                  <SelectInput
                    id="builder-audience"
                    placeholder="Any audience"
                    options={AUDIENCE_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
                    value={audiencePreset}
                    onChange={(e) => setAudiencePreset(e.target.value)}
                  />
                </FormField>
                {audiencePreset === "custom" ? (
                  <FormField label="Describe the audience" htmlFor="builder-audience-custom">
                    <TextInput
                      id="builder-audience-custom"
                      value={audienceCustom}
                      onChange={(e) => setAudienceCustom(e.target.value)}
                      autoComplete="off"
                      placeholder="e.g. Nurses moving into hospital administration…"
                    />
                  </FormField>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Modules" htmlFor="builder-modules">
                    <SelectInput
                      id="builder-modules"
                      placeholder="Auto"
                      options={MODULE_OPTIONS}
                      value={moduleCount}
                      onChange={(e) => setModuleCount(e.target.value)}
                    />
                  </FormField>
                  <FormField label="Lessons per module" htmlFor="builder-lessons-per-module">
                    <SelectInput
                      id="builder-lessons-per-module"
                      placeholder="Auto"
                      options={LESSONS_PER_MODULE_OPTIONS}
                      value={lessonsPerModule}
                      onChange={(e) => setLessonsPerModule(e.target.value)}
                    />
                  </FormField>
                </div>
                <FormField label="Quizzes" htmlFor="builder-quiz-mode">
                  <SelectInput
                    id="builder-quiz-mode"
                    allowEmpty={false}
                    options={QUIZ_MODE_OPTIONS}
                    value={quizMode}
                    onChange={(e) => setQuizMode(e.target.value)}
                  />
                </FormField>

                <FormField
                  label="Anything else (optional)"
                  htmlFor="builder-hints"
                  hint="Pacing, what to emphasise, topics that must be covered."
                >
                  <TextInput
                    id="builder-hints"
                    value={extraHints}
                    onChange={(e) => setExtraHints(e.target.value)}
                    autoComplete="off"
                    placeholder="e.g. focus on hands-on examples…"
                  />
                </FormField>

                <FormField
                  label="Source material (optional)"
                  htmlFor="builder-source"
                  hint="Paste a syllabus, notes or an article. The course is written from this instead of from general knowledge."
                >
                  <TextArea
                    id="builder-source"
                    rows={4}
                    value={sourceMaterial}
                    onChange={(e) => setSourceMaterial(e.target.value)}
                  />
                </FormField>
              </>
            ) : (
              <FormField
                label="Course file contents"
                htmlFor="builder-json"
                hint="A course exported from this platform is added exactly as it is. A course outline in another format is adapted by AI."
              >
                <div className="flex flex-col gap-2">
                  <TextArea
                    id="builder-json"
                    rows={8}
                    value={importJson}
                    onChange={(e) => setImportJson(e.target.value)}
                    placeholder='{"format": "lms-course", ...} — or any course-like JSON'
                  />
                  <div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={readImportFile}
                      className="hidden"
                      tabIndex={-1}
                      aria-hidden
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Icon name="upload" aria-hidden />
                      Choose a .json file
                    </Button>
                  </div>
                </div>
              </FormField>
            )}

            <div className="flex items-start gap-2.5">
              <Checkbox
                id="builder-placeholders"
                checked={allowPlaceholders}
                onCheckedChange={(v) => setAllowPlaceholders(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="builder-placeholders" className="text-sm font-medium">
                Leave room for videos and files
                <span className="block text-[12px] font-medium text-muted-foreground">
                  Adds empty video and file lessons where they would help, for you to attach the
                  real thing later.
                </span>
              </label>
            </div>

            <div className="flex items-start gap-2.5">
              <Checkbox
                id="builder-essays"
                checked={allowEssays}
                onCheckedChange={(v) => setAllowEssays(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="builder-essays" className="text-sm font-medium">
                Include written-answer questions
                <span className="block text-[12px] font-medium text-muted-foreground">
                  These are marked by AI against a rubric, and the marks count towards the
                  quiz&rsquo;s pass mark. Check each rubric in the draft before adding it.
                </span>
              </label>
            </div>

            {error ? <p role="alert" className="text-sm font-bold text-destructive">{error}</p> : null}

            <Button onClick={generate} disabled={generating || applying} className="w-full">
              <Icon name="sparkles" aria-hidden />
              {generating ? "Generating…" : preview ? "Generate again" : "Generate a draft"}
            </Button>
          </div>
        </Card>
      </div>

      {/* ---- Preview workspace ---- */}
      <div className="min-w-0">
        {preview ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-dashed border-border pb-4">
              <div>
                <h2 className="font-heading text-lg leading-tight">Draft course</h2>
                <p className="num mt-1 text-xs font-medium text-muted-foreground">
                  {preview.groups.length} module{preview.groups.length === 1 ? "" : "s"} and{" "}
                  {lessonCount} lesson{lessonCount === 1 ? "" : "s"}. Rename, reorder or remove
                  anything, then add it to the course.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreview(null);
                    setWarnings([]);
                  }}
                  disabled={applying || generating}
                >
                  Discard
                </Button>
                <Button onClick={apply} disabled={applying || generating}>
                  <Icon name="check" aria-hidden />
                  {applying ? "Adding…" : "Add to course"}
                </Button>
              </div>
            </div>
            {warnings.length > 0 ? (
              <div
                role="status"
                className="mt-4 rounded-[10px] border-2 border-warning bg-warning/15 p-4 text-sm"
              >
                <p className="font-bold text-foreground">
                  {warnings.length === 1
                    ? "One item could not be written"
                    : `${warnings.length} items could not be written`}
                </p>
                <p className="mt-1 font-medium text-muted-foreground">
                  The rest of the course is ready. Lessons listed here are in the outline but empty:
                  after adding the draft, open each one and use &ldquo;Write with AI&rdquo;, or
                  generate again. Quizzes listed here were left out
                  {missingQuizzes.length > 0 ? ": you can generate just those now, below." : "."}
                </p>
                <ul className="mt-3 flex flex-col gap-1.5">
                  {warnings.map((w, i) => (
                    <li key={`${w.module}-${w.title}-${i}`} className="font-medium text-foreground">
                      <span className="font-bold">{w.kind === "quiz" ? "Quiz" : "Lesson"}:</span>{" "}
                      {w.title}{" "}
                      <span className="text-muted-foreground">
                        ({w.module}) — {w.reason}
                      </span>
                    </li>
                  ))}
                </ul>
                {missingQuizzes.length > 0 ? (
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void generateMissingQuizzes()}
                      disabled={generating || applying}
                    >
                      <Icon name="sparkles" aria-hidden />
                      {missingQuizzes.length === 1 ? "Generate the missing quiz" : "Generate the missing quizzes"}
                    </Button>
                    <span className="text-xs font-medium text-muted-foreground">
                      Written from the lessons in this draft and added to it. Nothing is saved
                      until you add the draft to the course.
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4">
              <BuilderPreviewTree
                course={preview}
                canEdit={!applying && !generating}
                onChange={setPreview}
              />
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState icon="sparkles" title="Your draft will appear here" className="py-16">
              Describe the course, then choose &ldquo;Generate a draft&rdquo;.{" "}
              {existingLessonCount > 0
                ? `The ${existingLessonCount} lesson${existingLessonCount === 1 ? "" : "s"} already in this course ${existingLessonCount === 1 ? "is" : "are"} left as ${existingLessonCount === 1 ? "it is" : "they are"}; anything new is added after ${existingLessonCount === 1 ? "it" : "them"}.`
                : "You can review and change everything here before any of it is saved."}
            </EmptyState>
          </Card>
        )}
      </div>
    </div>
  );
}
