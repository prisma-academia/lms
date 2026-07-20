"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/client/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { formatBytes, formatDuration, formatDimensions } from "@/lib/media/format";
import { MEDIA_KIND_LABEL } from "@/lib/media/kind";
import { AssignmentPicker } from "./assignment-picker";
import { MediaThumb } from "./media-card";
import type { GrantView, LibraryItemView, Named, LibraryTagRef } from "./types";

type Visibility = "private" | "public" | "paid";

function visibilityOf(item: LibraryItemView): Visibility {
  if (!item.isFree) return "paid";
  return item.isPublic ? "public" : "private";
}

type DrawerProps = {
  item: LibraryItemView | null;
  folders: Named[];
  tags: LibraryTagRef[];
  canWrite: boolean;
  canAssign: boolean;
  onClose: () => void;
  onChanged: (patch: Partial<LibraryItemView>) => void;
  onDeleted: (id: string) => void;
};

/**
 * Outer shell only owns open/closed. The body is keyed by item id so switching
 * items remounts it — that gives each item a fresh useState from its own props
 * instead of syncing props into state from an effect, which renders twice and
 * briefly shows the previous item's values.
 */
export function DetailsDrawer(props: DrawerProps) {
  const { item, onClose } = props;
  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      {item ? <DetailsBody key={item.id} {...props} item={item} /> : null}
    </Sheet>
  );
}

function DetailsBody({
  item,
  folders,
  tags,
  canWrite,
  canAssign,
  onClose,
  onChanged,
  onDeleted,
}: Omit<DrawerProps, "item"> & { item: LibraryItemView }) {
  const [grants, setGrants] = useState<GrantView[]>([]);
  const [draft, setDraft] = useState<LibraryItemView>(item);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadGrants = useCallback(async (id: string) => {
    const res = await apiGet<{ grants: GrantView[] }>(`/api/tenant/library/${id}/grants`);
    setGrants(res.data?.grants ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await apiGet<{ grants: GrantView[] }>(`/api/tenant/library/${item.id}/grants`);
      if (!cancelled) setGrants(res.data?.grants ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  const visibility = visibilityOf(draft);

  async function save(patch: Partial<LibraryItemView> & Record<string, unknown>) {
    if (!item) return;
    setSaving(true);
    setError(null);
    const res = await apiPatch(`/api/tenant/library/${item.id}`, patch);
    setSaving(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    onChanged(patch);
  }

  function setLocal(patch: Partial<LibraryItemView>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  async function addGrant(subjectType: GrantView["subjectType"], subjectId?: string) {
    if (!item) return;
    const res = await apiPost<{ grant: GrantView }>(`/api/tenant/library/${item.id}/grants`, {
      subjectType,
      subjectId,
    });
    if (res.error) return setError(res.error.message);
    await loadGrants(item.id);
    onChanged({ _count: { grants: grants.length + 1, entitlements: item._count?.entitlements ?? 0 } });
  }

  async function removeGrant(grantId: string) {
    if (!item) return;
    const res = await apiDelete(`/api/tenant/library/${item.id}/grants/${grantId}`);
    if (res.error) return setError(res.error.message);
    await loadGrants(item.id);
  }

  async function remove() {
    if (!item) return;
    if (!confirm(`Delete "${draft?.title || draft?.name}"? This removes the file permanently.`)) return;
    const res = await apiDelete(`/api/tenant/library/${item.id}`);
    if (res.error) return setError(res.error.message);
    onDeleted(item.id);
    onClose();
  }

  return (
    <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="truncate">{draft.title || draft.name}</SheetTitle>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-5">
          <MediaThumb item={draft} className="aspect-video w-full" />

          {error ? <p className="text-sm font-bold text-destructive">{error}</p> : null}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <Fact label="Type" value={MEDIA_KIND_LABEL[draft.mediaKind]} />
            <Fact label="Size" value={formatBytes(draft.sizeBytes)} />
            {draft.durationSeconds ? (
              <Fact label="Duration" value={formatDuration(draft.durationSeconds)} />
            ) : null}
            {formatDimensions(draft.width, draft.height) ? (
              <Fact label="Dimensions" value={formatDimensions(draft.width, draft.height)!} />
            ) : null}
            <Fact label="Added" value={new Date(draft.createdAt).toLocaleDateString()} />
            {(draft._count?.entitlements ?? 0) > 0 ? (
              <Fact label="Purchases" value={String(draft._count!.entitlements)} />
            ) : null}
          </div>

          <FormField label="Title" htmlFor="d-title">
            <TextInput
              id="d-title"
              value={draft.title ?? draft.name}
              disabled={!canWrite}
              onChange={(e) => setLocal({ title: e.target.value })}
              onBlur={() => save({ title: draft.title ?? draft.name })}
            />
          </FormField>

          <FormField label="Description" htmlFor="d-desc">
            <TextArea
              id="d-desc"
              rows={3}
              value={draft.description ?? ""}
              disabled={!canWrite}
              onChange={(e) => setLocal({ description: e.target.value })}
              onBlur={() => save({ description: draft.description })}
            />
          </FormField>

          <FormField label="Folder" htmlFor="d-folder">
            <SelectInput
              id="d-folder"
              value={draft.folderId ?? ""}
              disabled={!canWrite}
              allowEmpty
              placeholder="Unfiled"
              onChange={(e) => {
                const v = e.target.value || null;
                setLocal({ folderId: v });
                void save({ folderId: v });
              }}
              options={folders.map((f) => ({ value: f.id, label: f.name }))}
            />
          </FormField>

          <div>
            <span className="mb-1.5 block text-sm font-bold">Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => {
                const on = draft.tags.some((x) => x.tag.id === t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    disabled={!canWrite}
                    onClick={() => {
                      const nextTags = on
                        ? draft.tags.filter((x) => x.tag.id !== t.id)
                        : [...draft.tags, { tag: t }];
                      setLocal({ tags: nextTags });
                      void save({ tagIds: nextTags.map((x) => x.tag.id) } as never);
                    }}
                    className={`rounded-full border-2 border-border px-2.5 py-0.5 text-xs font-bold ${
                      on ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"
                    }`}
                  >
                    {t.name}
                  </button>
                );
              })}
              {tags.length === 0 ? <p className="text-xs text-muted-foreground">No tags yet.</p> : null}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-bold">Visibility</span>
            <Segmented
              ariaLabel="Visibility"
              value={visibility}
              onChange={(next: Visibility) => {
                const patch =
                  next === "public"
                    ? { isPublic: true, isFree: true, priceCents: null }
                    : next === "paid"
                      ? { isPublic: true, isFree: false, currency: draft.currency ?? "NGN" }
                      : { isPublic: false, isFree: true, priceCents: null };
                setLocal(patch);
                // A paid item without a price is rejected server-side, so wait
                // for the price before saving that transition.
                if (next !== "paid" || (draft.priceCents ?? 0) > 0) void save(patch);
              }}
              options={[
                { value: "private", label: "Private" },
                { value: "public", label: "Public" },
                { value: "paid", label: "Paid" },
              ]}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {visibility === "public"
                ? "Any learner can find and open this."
                : visibility === "paid"
                  ? "Listed publicly. Opens after purchase — or for anyone assigned below."
                  : "Only the people assigned below can see this."}
            </p>
          </div>

          {visibility === "paid" ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Price" htmlFor="d-price">
                <TextInput
                  id="d-price"
                  inputMode="decimal"
                  disabled={!canWrite}
                  value={draft.priceCents != null ? String(draft.priceCents / 100) : ""}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    setLocal({ priceCents: Number.isFinite(n) ? Math.round(n * 100) : null });
                  }}
                  onBlur={() =>
                    save({ isPublic: true, isFree: false, priceCents: draft.priceCents, currency: draft.currency ?? "NGN" })
                  }
                />
              </FormField>
              <FormField label="Currency" htmlFor="d-currency">
                <SelectInput
                  id="d-currency"
                  disabled={!canWrite}
                  value={draft.currency ?? "NGN"}
                  onChange={(e) => {
                    setLocal({ currency: e.target.value });
                    void save({ currency: e.target.value });
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

          <div className="border-t-2 border-border pt-4">
            <div className="mb-2 flex items-center gap-2">
              <Icon name="users" className="size-4" />
              <span className="text-sm font-bold">Who can access this</span>
              {!draft.isFree ? <Badge color="var(--warning)">Assignment bypasses payment</Badge> : null}
            </div>
            <AssignmentPicker
              grants={grants}
              onAdd={addGrant}
              onRemove={removeGrant}
              disabled={!canAssign}
            />
          </div>
        </SheetBody>

        <SheetFooter className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{saving ? "Saving…" : "Changes save as you edit."}</span>
          {canWrite ? (
            <Button type="button" size="sm" variant="destructive" onClick={remove}>
              <Icon name="trash" /> Delete
            </Button>
          ) : null}
      </SheetFooter>
    </SheetContent>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border-2 border-border bg-background px-2 py-1.5">
      <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="num block truncate font-bold">{value}</span>
    </div>
  );
}
