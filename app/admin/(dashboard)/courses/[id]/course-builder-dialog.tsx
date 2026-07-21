"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/ui/toast";
import { BuilderPreviewTree } from "./builder-preview-tree";
import {
  courseTemplateSchema,
  type GeneratedCourse,
} from "@/lib/schemas/course-builder";
import {
  AUDIENCE_PRESETS,
  QUIZ_MODE_OPTIONS,
  serializeAudience,
  serializeStructureHints,
} from "./course-types";

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

export function CourseBuilderDialog({
  courseId,
  open,
  onOpenChange,
}: {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  const [importJson, setImportJson] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<GeneratedCourse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function readImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportJson(await file.text());
    if (fileRef.current) fileRef.current.value = "";
  }

  async function generate() {
    setError(null);

    if (mode === "import") {
      const raw = importJson.trim();
      if (!raw) {
        setError("Paste or upload course JSON first.");
        return;
      }
      // Exact-template JSON loads straight into the preview — no AI round-trip.
      try {
        const parsed = courseTemplateSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          setPreview({ courseSummary: parsed.data.courseSummary, groups: parsed.data.groups });
          toast("Template imported — review and apply.");
          return;
        }
      } catch {
        // Not JSON at all — let the AI try to make sense of it below.
      }
    } else if (!topic.trim()) {
      setError("Describe the course topic first.");
      return;
    }

    setGenerating(true);
    const res = await apiPost<{ course: GeneratedCourse }>(
      `/api/tenant/courses/${courseId}/builder/generate`,
      mode === "import"
        ? {
            mode: "adapt-json",
            topic: topic.trim() || "Course from imported JSON",
            sourceJson: importJson.trim(),
            allowPlaceholders,
          }
        : {
            mode: "prompt",
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
          }
    );
    setGenerating(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.course) setPreview(res.data.course);
  }

  async function apply() {
    if (!preview) return;
    setError(null);
    setApplying(true);
    const res = await apiPost<ApplyResult>(
      `/api/tenant/courses/${courseId}/builder/apply`,
      { course: preview }
    );
    setApplying(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    const c = res.data?.created;
    toast(
      c
        ? `Added ${c.groups} modules, ${c.lessons} lessons${c.quizzes ? `, ${c.quizzes} quizzes (${c.questions} questions)` : ""}.`
        : "Course structure applied."
    );
    setPreview(null);
    router.refresh();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogTitle>AI course builder</DialogTitle>
        <DialogDescription>
          Generate a full course structure — modules, lessons, and quizzes — from a prompt or an
          imported JSON file. Review the result, edit it, then apply it to this course.
        </DialogDescription>

        <div className="mt-4">
          <Segmented<SourceMode>
            ariaLabel="Builder source"
            options={[
              { value: "prompt", label: "Prompt" },
              { value: "import", label: "Import JSON" },
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
                  placeholder="e.g. Practical SQL for data analysts"
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      placeholder="e.g. Nurses moving into hospital administration"
                    />
                  </FormField>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                <FormField label="Quizzes" htmlFor="builder-quiz-mode">
                  <SelectInput
                    id="builder-quiz-mode"
                    allowEmpty={false}
                    options={QUIZ_MODE_OPTIONS}
                    value={quizMode}
                    onChange={(e) => setQuizMode(e.target.value)}
                  />
                </FormField>
              </div>

              <FormField
                label="Additional hints (optional)"
                htmlFor="builder-hints"
                hint="Pacing, emphasis, required topics…"
              >
                <TextInput
                  id="builder-hints"
                  value={extraHints}
                  onChange={(e) => setExtraHints(e.target.value)}
                  placeholder="e.g. focus on hands-on examples"
                />
              </FormField>

              <FormField
                label="Source material (optional)"
                htmlFor="builder-source"
                hint="Paste a syllabus, notes, or article text to base the course on."
              >
                <TextArea
                  id="builder-source"
                  rows={5}
                  value={sourceMaterial}
                  onChange={(e) => setSourceMaterial(e.target.value)}
                />
              </FormField>
            </>
          ) : (
            <FormField
              label="Course JSON"
              htmlFor="builder-json"
              hint="An exported course template applies as-is; any other JSON structure is adapted by AI."
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
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    Upload .json file
                  </Button>
                </div>
              </div>
            </FormField>
          )}

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={allowPlaceholders}
              onChange={(e) => setAllowPlaceholders(e.target.checked)}
            />
            Allow video/file placeholder lessons (you attach the assets later)
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex items-center gap-3">
            <Button onClick={generate} disabled={generating || applying}>
              {generating ? "Generating…" : preview ? "Regenerate" : "Generate"}
            </Button>
            {generating ? (
              <span className="text-xs text-stone-500">
                Writing your course — this can take a couple of minutes.
              </span>
            ) : null}
          </div>
          {generating ? <Spinner label="Generating course…" /> : null}

          {preview ? (
            <div className="mt-2 rounded-[14px] border-2 border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase text-stone-500">Preview</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    Edit titles, remove modules, lessons or questions — then apply. Everything is
                    added to this course; nothing existing is changed.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPreview(null)} disabled={applying}>
                    Discard
                  </Button>
                  <Button onClick={apply} disabled={applying}>
                    {applying ? "Applying…" : "Apply to course"}
                  </Button>
                </div>
              </div>
              <div className="mt-4">
                <BuilderPreviewTree course={preview} canEdit={!applying} onChange={setPreview} />
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
