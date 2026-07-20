"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client/api";
import { uploadViaPresign } from "@/lib/client/upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { FormField, SelectInput, TextInput } from "@/components/form-field";
import type { SelectOption } from "@/lib/geo/options";
import type { CourseInitial } from "./course-types";

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
  const [courseInfo, setCourseInfo] = useState<string | null>(null);
  const [coursePending, setCoursePending] = useState(false);

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
    setCourseInfo("Thumbnail updated.");
    router.refresh();
  }

  async function saveCourse(patch?: { status?: string }) {
    setCourseError(null);
    setCourseInfo(null);
    setCoursePending(true);

    const priceCents =
      price.trim() === "" ? null : Math.round(parseFloat(price) * 100);
    if (price.trim() !== "" && (Number.isNaN(priceCents) || priceCents! < 0)) {
      setCourseError("Enter a valid price.");
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
    setCourseInfo("Course saved.");
    router.refresh();
  }

  async function publishCourse() {
    await saveCourse({ status: "PUBLISHED" });
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase text-stone-500">Course details</h2>
      <div className="mt-4 flex max-w-xl flex-col gap-4">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-stone-500">Status</dt>
          <dd>{status}</dd>
          <dt className="text-stone-500">Enrollments</dt>
          <dd>{initial.enrollmentCount}</dd>
          {initial.publishedAt ? (
            <>
              <dt className="text-stone-500">Published</dt>
              <dd>{new Date(initial.publishedAt).toLocaleString()}</dd>
            </>
          ) : null}
        </dl>

        <FormField label="Title" htmlFor="course-title">
          <TextInput
            id="course-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canWrite}
          />
        </FormField>
        <FormField label="Slug" htmlFor="course-slug">
          <TextInput
            id="course-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={!canWrite}
          />
        </FormField>
        <FormField label="Description" htmlFor="course-desc">
          <textarea
            id="course-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            disabled={!canWrite}
            className="rounded border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-stone-500 disabled:opacity-60"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Price (empty = free)" htmlFor="course-price">
            <TextInput
              id="course-price"
              type="number"
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
          label="Visibility"
          htmlFor="course-visibility"
          hint="Public courses appear in the learner catalog and are self-enrollable. Private courses require staff to onboard learners."
        >
          <SelectInput
            id="course-visibility"
            allowEmpty={false}
            options={[
              { value: "PUBLIC", label: "Public — self-enrollable" },
              { value: "PRIVATE", label: "Private — manual onboarding only" },
            ]}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            disabled={!canWrite}
          />
        </FormField>
        {canWrite ? (
          <div>
            <span className="text-[13px] font-bold text-foreground">Thumbnail</span>
            <div className="mt-1 flex items-center gap-3">
              <input ref={thumbRef} type="file" accept="image/*" onChange={uploadThumbnail} className="hidden" />
              <Button type="button" variant="outline" size="sm" onClick={() => thumbRef.current?.click()} disabled={thumbBusy}>
                {thumbBusy ? "Uploading…" : "Upload thumbnail"}
              </Button>
            </div>
          </div>
        ) : null}

        {courseError ? <p className="text-sm text-red-600">{courseError}</p> : null}
        {courseInfo ? <p className="text-sm text-green-700">{courseInfo}</p> : null}
        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <>
              <Button onClick={() => saveCourse()} disabled={coursePending}>
                {coursePending ? "Saving…" : "Save"}
              </Button>
              {status !== "PUBLISHED" ? (
                <Button variant="secondary" onClick={publishCourse} disabled={coursePending}>
                  Publish
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
          <Button variant="outline" asChild>
            <a href={`/api/tenant/courses/${initial.id}/export`} download>
              Export JSON
            </a>
          </Button>
        </div>
      </div>
    </Card>
  );
}
