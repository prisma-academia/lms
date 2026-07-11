"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";
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
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    setInfo(null);
    setSaving(true);
    try {
      const priceCents = price.trim() === "" ? null : Math.round(parseFloat(price) * 100);
      if (price.trim() !== "" && (priceCents === null || Number.isNaN(priceCents) || priceCents < 0)) {
        setError("Enter a valid price.");
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
      setInfo("Saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this programme? Its courses are not deleted, only the grouping.")) return;
    setError(null);
    setDeleting(true);
    const res = await apiDelete(`/api/tenant/programmes/${id}`);
    if (res.error) {
      setError(res.error.message);
      setDeleting(false);
      return;
    }
    router.push("/admin/programmes");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-sm font-semibold uppercase text-stone-500">Programme details</h2>
        <div className="mt-4 flex max-w-xl flex-col gap-4">
          <FormField label="Title" htmlFor="p-title">
            <TextInput id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canWrite} />
          </FormField>
          <FormField label="Slug" htmlFor="p-slug">
            <TextInput id="p-slug" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!canWrite} />
          </FormField>
          <FormField label="Description" htmlFor="p-desc">
            <TextArea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Price (empty = free)" htmlFor="p-price">
              <TextInput
                id="p-price"
                type="number"
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
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Status" htmlFor="p-status">
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
            <FormField label="Visibility" htmlFor="p-visibility">
              <SelectInput
                id="p-visibility"
                allowEmpty={false}
                options={[
                  { value: "PUBLIC", label: "Public — self-enrollable" },
                  { value: "PRIVATE", label: "Private — manual only" },
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
        <h2 className="text-sm font-semibold uppercase text-stone-500">Courses in this programme</h2>
        {selected.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">No courses added yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {selected.map((s, idx) => (
              <li key={s.courseId} className="rounded-[10px] border-2 border-ink bg-paper p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-semibold text-ink">
                    {idx + 1}. {s.title}
                  </span>
                  {canWrite ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="outline" size="sm" onClick={() => move(idx, -1)}>↑</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => move(idx, 1)}>↓</Button>
                      <Button type="button" variant="destructive" size="sm" onClick={() => removeCourse(s.courseId)}>
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </div>
                {canWrite ? (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <FormField label="Requirement" htmlFor={`req-${s.courseId}`}>
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
                    <FormField label="Group label (optional)" htmlFor={`grp-${s.courseId}`}>
                      <TextInput
                        id={`grp-${s.courseId}`}
                        value={s.groupLabel}
                        onChange={(e) => update(s.courseId, { groupLabel: e.target.value })}
                        placeholder="e.g. Foundations"
                      />
                    </FormField>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-ink/60">
                    {s.required ? "Required" : "Optional"}
                    {s.groupLabel ? ` · ${s.groupLabel}` : ""}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {canWrite ? (
          <div className="mt-6 border-t-2 border-dashed border-ink/25 pt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-ink">Add courses</h3>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search courses…"
                className="rounded-[10px] border-2 border-ink bg-card px-3 py-1.5 text-sm outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-[10px] border-2 border-ink">
              {available.length === 0 ? (
                <p className="p-3 text-sm text-ink/60">No more courses to add.</p>
              ) : (
                available.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 border-b border-ink/10 px-3 py-2 last:border-b-0"
                  >
                    <span className="min-w-0 truncate text-sm text-ink">
                      {c.title} <span className="text-xs text-ink/50">({c.status})</span>
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={() => addCourse(c)}>
                      Add
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </Card>

      {error ? <p className="text-sm text-red">{error}</p> : null}
      {info ? <p className="text-sm text-ink/70">{info}</p> : null}

      {canWrite ? (
        <div className="flex items-center gap-3">
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="destructive" onClick={onDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete programme"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
