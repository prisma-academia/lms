"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { FormField, TextArea, TextInput } from "@/components/form-field";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/ui/toast";
import { BuilderPreviewTree } from "./builder-preview-tree";
import {
  courseTemplateSchema,
  type GeneratedCourse,
} from "@/lib/schemas/course-builder";

type SourceMode = "prompt" | "import";

type ApplyResult = {
  created: { groups: number; lessons: number; quizzes: number; questions: number };
};

export function CourseBuilderTab({
  courseId,
  onApplied,
}: {
  courseId: string;
  /** Called after a successful apply so the parent can switch to the Lessons tab. */
  onApplied: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [mode, setMode] = useState<SourceMode>("prompt");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [structureHints, setStructureHints] = useState("");
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
            audience: audience.trim() || null,
            structureHints: structureHints.trim() || null,
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
    onApplied();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-sm font-semibold uppercase text-stone-500">AI course builder</h2>
        <p className="mt-1 text-xs text-stone-500">
          Generate a full course structure — modules, lessons, and quizzes — from a prompt or an
          imported JSON file. Review the result below, edit it, then apply it to this course.
        </p>

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

        <div className="mt-4 flex max-w-xl flex-col gap-4">
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
              <FormField label="Audience (optional)" htmlFor="builder-audience">
                <TextInput
                  id="builder-audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="e.g. Beginners with no database experience"
                />
              </FormField>
              <FormField
                label="Structure hints (optional)"
                htmlFor="builder-hints"
                hint="Module count, pacing, emphasis, required topics…"
              >
                <TextInput
                  id="builder-hints"
                  value={structureHints}
                  onChange={(e) => setStructureHints(e.target.value)}
                  placeholder="e.g. 5 modules, quiz after every module"
                />
              </FormField>
              <FormField
                label="Source material (optional)"
                htmlFor="builder-source"
                hint="Paste a syllabus, notes, or article text to base the course on."
              >
                <TextArea
                  id="builder-source"
                  rows={6}
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
        </div>
      </Card>

      {preview ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase text-stone-500">Preview</h2>
              <p className="mt-1 text-xs text-stone-500">
                Edit titles, remove modules, lessons or questions — then apply. Everything is added
                to this course; nothing existing is changed.
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
        </Card>
      ) : null}
    </div>
  );
}
