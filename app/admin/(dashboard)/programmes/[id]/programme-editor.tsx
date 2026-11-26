"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, apiDelete } from "@/lib/client/api";
import { useSavedSnapshot, useUnsavedGuard } from "@/components/use-unsaved-guard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { SelectOption } from "@/lib/geo/options";

type CourseOption = { id: string; title: string; status: string };
type SelectedCourse = { courseId: string; title: string; required: boolean; groupLabel: string };

export function ProgrammeEditor({
  id,
  initial,
  selectedCourses,
  allCourses,
  canWrite,
  currencyOptions,
}: {
  id: string;
  initial: {
    title: string;
    slug: string;
    description: string;
    status: string;
    visibility: string;
    priceCents: number | null;
    currency: string;
  };
  selectedCourses: SelectedCourse[];
  allCourses: CourseOption[];
  canWrite: boolean;
  currencyOptions: SelectOption[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [description, setDescription] = useState(initial.description);
  const [status, setStatus] = useState(initial.status);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [price, setPrice] = useState(initial.priceCents != null ? String(initial.priceCents / 100) : "");
  const [currency, setCurrency] = useState(initial.currency);
  const [selected, setSelected] = useState<SelectedCourse[]>(selectedCourses);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Closing or reloading the tab over unsaved changes asks first. Everything
  // Save writes is in here; the course search box is not.
  const saved = useSavedSnapshot({ title, slug, description, status, visibility, price, currency, selected });
  useUnsavedGuard(canWrite && saved.dirty);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.courseId)), [selected]);
  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allCourses.filter(
      (c) => !selectedIds.has(c.id) && (q === "" || c.title.toLowerCase().includes(q))
    );
  }, [allCourses, selectedIds, query]);

  function addCourse(c: CourseOption) {
    setSelected((prev) => [...prev, { courseId: c.id, title: c.title, required: true, groupLabel: "" }]);
  }
  function removeCourse(courseId: string) {
    setSelected((prev) => prev.filter((s) => s.courseId !== courseId));
  }
  function move(index: number, dir: -1 | 1) {
    setSelected((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function update(courseId: string, patch: Partial<SelectedCourse>) {
    setSelected((prev) => prev.map((s) => (s.courseId === courseId ? { ...s, ...patch } : s)));
  }

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      const priceCents = price.trim() === "" ? null : Math.round(parseFloat(price) * 100);
      if (price.trim() !== "" && (priceCents === null || Number.isNaN(priceCents) || priceCents < 0)) {
        setError("Enter a valid price, or leave it empty for a free programme.");
        return;
      }
      const detailsRes = await apiPatch(`/api/tenant/programmes/${id}`, {
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim() === "" ? null : description,
        status,
        visibility,
        priceCents,
        currency,
      });
      if (detailsRes.error) {
        setError(detailsRes.error.message);
        return;
      }
      const coursesRes = await apiPost(`/api/tenant/programmes/${id}/courses`, {
        courses: selected.map((s, idx) => ({
          courseId: s.courseId,
          required: s.required,
          sortOrder: idx,
          groupLabel: s.groupLabel.trim() === "" ? null : s.groupLabel.trim(),
        })),
      });
      if (coursesRes.error) {
        setError(coursesRes.error.message);
        return;
      }
      saved.markSaved();
      toast("Programme saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: `Delete “${initial.title}”?`,
      description:
        "The programme is removed. Its courses are not deleted and learners stay enrolled in them. This cannot be undone.",
      confirmLabel: "Delete programme",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setDeleting(true);
    const res = await apiDelete(`/api/tenant/programmes/${id}`);
    if (res.error) {
      setError(res.error.message);
      setDeleting(false);
      return;
    }
    toast("Programme deleted.");
    router.push("/admin/programmes");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="font-heading text-lg leading-tight">Programme details</h2>
        <div className="mt-4 flex max-w-xl flex-col gap-4">
          <FormField label="Title" htmlFor="p-title">
            <TextInput id="p-title" autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canWrite} />
          </FormField>
          <FormField
            label="Web address"
            htmlFor="p-slug"
            hint="The last part of the programme link. Changing it breaks links that have already been shared."
          >
            <TextInput id="p-slug" autoComplete="off" spellCheck={false} value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!canWrite} />
          </FormField>
          <FormField label="Description" htmlFor="p-desc" hint="Shown on the programme page, before a learner enrolls.">
            <TextArea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite} />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Price" htmlFor="p-price" hint="Leave empty for a free programme.">
              <TextInput
                id="p-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={!canWrite}
              />
            </FormField>
            <FormField label="Currency" htmlFor="p-currency">
              <SelectInput
                id="p-currency"
                allowEmpty={false}
                options={currencyOptions}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={!canWrite}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Status" htmlFor="p-status" hint="Learners only see a published programme.">
              <SelectInput
                id="p-status"
                allowEmpty={false}
                options={[
                  { value: "DRAFT", label: "Draft" },
                  { value: "PUBLISHED", label: "Published" },
                  { value: "ARCHIVED", label: "Archived" },
                ]}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={!canWrite}
              />
            </FormField>
            <FormField label="Who can join" htmlFor="p-visibility">
              <SelectInput
                id="p-visibility"
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
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="font-heading text-lg leading-tight">Courses in this programme</h2>
        <p className="num mt-1 text-[13px] font-medium text-muted-foreground">
          {selected.length} course{selected.length === 1 ? "" : "s"}, shown to learners in this order.
        </p>
        {selected.length === 0 ? (
          <EmptyState icon="book" title="No courses yet" className="py-6">
            {canWrite
              ? "Add courses from the list below. A programme needs at least one published course before learners can enroll."
              : "This programme has no courses in it yet."}
          </EmptyState>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {selected.map((s, idx) => (
              <li key={s.courseId} className="rounded-[10px] border-2 border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <span className="min-w-0 break-words font-bold text-foreground">
                    <span className="num">{idx + 1}.</span> {s.title}
                  </span>
                  {canWrite ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Move “${s.title}” up`}
                        disabled={idx === 0}
                        onClick={() => move(idx, -1)}
                      >
                        <Icon name="chevron-up" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Move “${s.title}” down`}
                        disabled={idx === selected.length - 1}
                        onClick={() => move(idx, 1)}
                      >
                        <Icon name="chevron-down" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        aria-label={`Remove “${s.title}” from this programme`}
                        onClick={() => removeCourse(s.courseId)}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </div>
                {canWrite ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormField label="Required or optional" htmlFor={`req-${s.courseId}`}>
                      <SelectInput
                        id={`req-${s.courseId}`}
                        allowEmpty={false}
                        options={[
                          { value: "required", label: "Required" },
                          { value: "optional", label: "Optional" },
                        ]}
                        value={s.required ? "required" : "optional"}
                        onChange={(e) => update(s.courseId, { required: e.target.value === "required" })}
                      />
                    </FormField>
                    <FormField label="Section heading (optional)" htmlFor={`grp-${s.courseId}`}>
                      <TextInput
                        id={`grp-${s.courseId}`}
                        autoComplete="off"
                        value={s.groupLabel}
                        onChange={(e) => update(s.courseId, { groupLabel: e.target.value })}
                        placeholder="e.g. Foundations…"
                      />
                    </FormField>
                  </div>
                ) : (
                  <div className="mt-1 text-xs font-medium text-muted-foreground">
                    {s.required ? "Required" : "Optional"}
                    {s.groupLabel ? ` · ${s.groupLabel}` : ""}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {canWrite ? (
          <div className="mt-6 border-t-2 border-dashed border-border pt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h3 className="text-sm font-bold text-foreground">Add courses</h3>
              <label htmlFor="programme-course-search" className="sr-only">
                Search courses to add
              </label>
              <input
                id="programme-course-search"
                type="search"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search courses…"
                className="w-full rounded-[10px] border-2 border-border bg-card px-3 py-1.5 text-sm text-card-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring sm:w-64"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-[10px] border-2 border-border">
              {available.length === 0 ? (
                <p className="p-3 text-sm font-medium text-muted-foreground">
                  {query.trim()
                    ? `No courses match “${query.trim()}”.`
                    : allCourses.length === 0
                      ? "There are no courses yet. Create one under Courses first."
                      : "Every course is already in this programme."}
                </p>
              ) : (
                available.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">{c.title}</span>
                      {c.status !== "PUBLISHED" ? (
                        <Badge className="shrink-0">
                          {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                        </Badge>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      aria-label={`Add “${c.title}” to this programme`}
                      onClick={() => addCourse(c)}
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

      {/* The destructive action sits apart from Save, at the far end. */}
      {canWrite ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" onClick={onSave} disabled={saving || deleting}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="destructive" onClick={onDelete} disabled={deleting || saving}>
            {deleting ? "Deleting…" : "Delete programme"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
