"use client";

import { useState } from "react";
import { apiPost, apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";
import { Segmented } from "@/components/ui/segmented";
import { Icon } from "@/components/icon";
import { useUploadManager } from "@/lib/client/uploads/use-uploads";
import type { UploadTask } from "@/lib/client/uploads/types";
import type { Named } from "./upload-queue";

/**
 * Only three states exist at upload time. "Assigned" is not a stored flag —
 * it is the presence of grants, which are created later from the item's
 * details panel, so offering it here would be a control that saves nothing.
 */
type Visibility = "private" | "public" | "paid";

function visibilityOf(task: UploadTask): Visibility {
  if (!task.meta.isFree) return "paid";
  return task.meta.isPublic ? "public" : "private";
}

/**
 * Per-row metadata, editable while the bytes are still uploading.
 *
 * Deliberately plain controlled state rather than react-hook-form: a form
 * instance per row across a 40-file queue is a lot of machinery for four
 * fields, and the values live in the upload manager (and thus IndexedDB)
 * rather than in the component.
 */
export function UploadMetaForm({
  task,
  folders,
  tags,
  onTagCreated,
}: {
  task: UploadTask;
  folders: Named[];
  tags: Named[];
  onTagCreated: (tag: Named) => void;
}) {
  const manager = useUploadManager();
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const visibility = visibilityOf(task);

  // Once committed, edits go to the item itself rather than the queued metadata.
  const committed = task.status === "done" && task.itemId;

  async function patchCommitted(patch: Record<string, unknown>) {
    if (!task.itemId) return;
    setSaving(true);
    const res = await apiPatch(`/api/tenant/library/${task.itemId}`, patch);
    setSaving(false);
    setSavedNote(res.error ? res.error.message : "Saved");
    setTimeout(() => setSavedNote(null), 2000);
  }

  function set(patch: Parameters<typeof manager.setMeta>[1]) {
    manager.setMeta(task.id, patch);
  }

  async function createTag() {
    const name = newTag.trim();
    if (!name) return;
    const res = await apiPost<{ tag: Named }>("/api/tenant/library/tags", { name });
    if (res.error || !res.data) return;
    onTagCreated(res.data.tag);
    set({ tagIds: [...new Set([...task.meta.tagIds, res.data.tag.id])] });
    setNewTag("");
  }

  function toggleTag(id: string) {
    const next = task.meta.tagIds.includes(id)
      ? task.meta.tagIds.filter((t) => t !== id)
      : [...task.meta.tagIds, id];
    set({ tagIds: next });
    if (committed) void patchCommitted({ tagIds: next });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Title" htmlFor={`t-${task.id}`}>
          <TextInput
            id={`t-${task.id}`}
            value={task.meta.name}
            onChange={(e) => set({ name: e.target.value })}
            onBlur={() => committed && patchCommitted({ name: task.meta.name })}
          />
        </FormField>
        <FormField label="Folder" htmlFor={`f-${task.id}`}>
          <SelectInput
            id={`f-${task.id}`}
            value={task.meta.folderId ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              set({ folderId: v });
              if (committed) void patchCommitted({ folderId: v });
            }}
            allowEmpty
            placeholder="No folder"
            options={folders.map((f) => ({ value: f.id, label: f.name }))}
          />
        </FormField>
      </div>

      <FormField label="Description" htmlFor={`d-${task.id}`}>
        <TextArea
          id={`d-${task.id}`}
          rows={2}
          value={task.meta.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
          onBlur={() => committed && patchCommitted({ description: task.meta.description })}
        />
      </FormField>

      <div>
        <span className="mb-1.5 block text-sm font-bold">Tags</span>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = task.meta.tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTag(t.id)}
                className={`rounded-full border-2 border-border px-2.5 py-0.5 text-xs font-bold transition-transform hover:-translate-y-px ${
                  on ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"
                }`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-end gap-2">
          <TextInput
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createTag();
              }
            }}
            placeholder="New tag…"
            className="max-w-40"
            aria-label="New tag name"
          />
          <Button type="button" size="sm" variant="outline" onClick={() => void createTag()}>
            Add
          </Button>
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-bold">Who can see this</span>
        <Segmented
          value={visibility}
          onChange={(next: Visibility) => {
            const patch =
              next === "public"
                ? { isPublic: true, isFree: true, priceCents: null }
                : next === "paid"
                  ? { isPublic: true, isFree: false, currency: task.meta.currency ?? "NGN" }
                  : { isPublic: false, isFree: true, priceCents: null };
            set(patch);
            if (committed) void patchCommitted(patch);
          }}
          ariaLabel="Visibility"
          options={[
            { value: "private", label: "Private" },
            { value: "public", label: "Public" },
            { value: "paid", label: "Paid" },
          ]}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {visibility === "public"
            ? "Any learner in this tenant can find and open it."
            : visibility === "paid"
              ? "Listed publicly, but only opens after purchase — or after you assign it to someone."
              : "Only people you assign it to can see it. Assign from the item's details panel."}
        </p>
      </div>

      {visibility === "paid" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Price" htmlFor={`p-${task.id}`}>
            <TextInput
              id={`p-${task.id}`}
              inputMode="decimal"
              value={task.meta.priceCents != null ? String(task.meta.priceCents / 100) : ""}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                set({ priceCents: Number.isFinite(n) ? Math.round(n * 100) : null });
              }}
              onBlur={() => committed && patchCommitted({ priceCents: task.meta.priceCents })}
              placeholder="0.00"
            />
          </FormField>
          <FormField label="Currency" htmlFor={`c-${task.id}`}>
            <SelectInput
              id={`c-${task.id}`}
              value={task.meta.currency ?? "NGN"}
              onChange={(e) => {
                set({ currency: e.target.value });
                if (committed) void patchCommitted({ currency: e.target.value });
              }}
              options={[
                { value: "NGN", label: "NGN" },
                { value: "USD", label: "USD" },
                { value: "GBP", label: "GBP" },
                { value: "EUR", label: "EUR" },
              ]}
            />
          </FormField>
        </div>
      ) : null}

      {committed ? (
        <p className="text-xs text-muted-foreground">
          {saving ? "Saving…" : savedNote ? <span className="inline-flex items-center gap-1"><Icon name="check" className="size-3" /> {savedNote}</span> : "Changes save as you edit."}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Details are applied when the upload finishes.</p>
      )}
    </div>
  );
}
