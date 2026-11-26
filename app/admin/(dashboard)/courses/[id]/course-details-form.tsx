"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client/api";
import { uploadViaPresign } from "@/lib/client/upload";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/shell";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { useSavedSnapshot, useUnsavedGuard } from "@/components/use-unsaved-guard";
import type { SelectOption } from "@/lib/geo/options";
import type { CourseInitial } from "./course-types";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export function CourseDetailsForm({
  initial,
  canWrite,
  currencyOptions,
}: {
  initial: CourseInitial;
  canWrite: boolean;
  currencyOptions: SelectOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [description, setDescription] = useState(initial.description);
  const [price, setPrice] = useState(
    initial.priceCents != null ? String(initial.priceCents / 100) : ""
  );
  const [currency, setCurrency] = useState(initial.currency);
  const [status, setStatus] = useState(initial.status);
  const [visibility, setVisibility] = useState(initial.visibility);

  const [courseError, setCourseError] = useState<string | null>(null);
  const [coursePending, setCoursePending] = useState(false);

  // Closing or reloading the tab over unsaved details asks first. Status is
  // left out: it only changes through Publish/Unpublish, which save at once.
  const saved = useSavedSnapshot({ title, slug, description, price, currency, visibility });
  useUnsavedGuard(canWrite && saved.dirty);

  const thumbRef = useRef<HTMLInputElement>(null);
  const [thumbBusy, setThumbBusy] = useState(false);

  async function uploadThumbnail(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbBusy(true);
    setCourseError(null);
    const up = await uploadViaPresign("/api/tenant/uploads/presign", file, {
      kind: "course_thumbnail",
      courseId: initial.id,
    });
    if ("error" in up) {
      setCourseError(up.error);
      setThumbBusy(false);
      if (thumbRef.current) thumbRef.current.value = "";
      return;
    }
    const res = await apiPatch(`/api/tenant/courses/${initial.id}`, { thumbnailKey: up.key });
    setThumbBusy(false);
    if (thumbRef.current) thumbRef.current.value = "";
    if (res.error) {
      setCourseError(res.error.message);
      return;
    }
    toast("Thumbnail updated.");
    router.refresh();
  }

  async function saveCourse(patch?: { status?: string }) {
    setCourseError(null);
    setCoursePending(true);

    const priceCents =
      price.trim() === "" ? null : Math.round(parseFloat(price) * 100);
    if (price.trim() !== "" && (Number.isNaN(priceCents) || priceCents! < 0)) {
      setCourseError("Enter a valid price, or leave it empty for a free course.");
      setCoursePending(false);
      return;
    }

    const res = await apiPatch<{ course: { status: string } }>(
      `/api/tenant/courses/${initial.id}`,
      {
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        priceCents,
        currency,
        visibility,
        ...(patch ?? {}),
      }
    );
    setCoursePending(false);
    if (res.error) {
      setCourseError(res.error.message);
      return;
    }
    if (res.data?.course.status) setStatus(res.data.course.status);
    saved.markSaved();
    // Say what actually happened: "saved" after pressing Publish reads as if
    // the publish did not take.
    toast(
      patch?.status === "PUBLISHED"
        ? "Course published."
        : patch?.status === "DRAFT"
          ? "Course unpublished."
          : "Course saved."
    );
    router.refresh();
  }

  async function publishCourse() {
    await saveCourse({ status: "PUBLISHED" });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-heading text-lg leading-tight">Course details</h2>
        <Badge color={status === "PUBLISHED" ? "var(--success)" : undefined}>
          {STATUS_LABELS[status] ?? status}
        </Badge>
      </div>
      <p className="num mt-1.5 text-[13px] font-medium text-muted-foreground">
        {initial.enrollmentCount} {initial.enrollmentCount === 1 ? "learner" : "learners"} enrolled
        {initial.publishedLabel ? ` · published ${initial.publishedLabel}` : ""}
      </p>

      <div className="mt-5 flex max-w-xl flex-col gap-4">
        <FormField label="Title" htmlFor="course-title">
          <TextInput
            id="course-title"
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canWrite}
          />
        </FormField>
        <FormField
          label="Web address"
          htmlFor="course-slug"
          hint="The last part of the course link. Changing it breaks links that have already been shared."
        >
          <TextInput
            id="course-slug"
            autoComplete="off"
            spellCheck={false}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={!canWrite}
          />
        </FormField>
        <FormField
          label="Description"
          htmlFor="course-desc"
          hint="Shown on the course page, before a learner enrolls."
        >
          <TextArea
            id="course-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            disabled={!canWrite}
          />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Price" htmlFor="course-price" hint="Leave empty for a free course.">
            <TextInput
              id="course-price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={!canWrite}
            />
          </FormField>
          <FormField label="Currency" htmlFor="course-currency">
            <SelectInput
              id="course-currency"
              allowEmpty={false}
              options={currencyOptions}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={!canWrite}
            />
          </FormField>
        </div>
        <FormField
          label="Who can join"
          htmlFor="course-visibility"
          hint="Public courses are listed in the catalogue and learners can enroll themselves. Private courses are hidden, and staff enroll learners."
        >
          <SelectInput
            id="course-visibility"
            allowEmpty={false}
            options={[
              { value: "PUBLIC", label: "Public — learners enroll themselves" },
              { value: "PRIVATE", label: "Private — staff enroll learners" },
            ]}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            disabled={!canWrite}
          />
        </FormField>
        {canWrite ? (
          <div>
            <span className="text-[13px] font-bold text-foreground">Thumbnail</span>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">
              The picture shown on the course card. A wide image works best.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <input
                ref={thumbRef}
                type="file"
                accept="image/*"
                onChange={uploadThumbnail}
                className="hidden"
                tabIndex={-1}
                aria-hidden
              />
              <Button type="button" variant="outline" size="sm" onClick={() => thumbRef.current?.click()} disabled={thumbBusy}>
                <Icon name="upload" aria-hidden />
                {thumbBusy ? "Uploading…" : "Upload thumbnail"}
              </Button>
            </div>
          </div>
        ) : null}

        {courseError ? (
          <p role="alert" className="text-sm font-bold text-destructive">
            {courseError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-dashed border-border pt-4">
          <div className="flex flex-wrap gap-2">
            {canWrite ? (
              <>
                <Button onClick={() => saveCourse()} disabled={coursePending}>
                  {coursePending ? "Saving…" : "Save changes"}
                </Button>
                {status !== "PUBLISHED" ? (
                  <Button variant="secondary" onClick={publishCourse} disabled={coursePending}>
                    Save and publish
                  </Button>
                ) : null}
                {status === "PUBLISHED" ? (
                  <Button
                    variant="outline"
                    onClick={() => saveCourse({ status: "DRAFT" })}
                    disabled={coursePending}
                  >
                    Unpublish
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
          <Button variant="ghost" asChild>
            <a href={`/api/tenant/courses/${initial.id}/export`} download>
              <Icon name="download" aria-hidden />
              Export as file
            </a>
          </Button>
        </div>
      </div>
    </Card>
  );
}
