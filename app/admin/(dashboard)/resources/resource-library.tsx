"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, apiDelete } from "@/lib/client/api";
import { uploadViaPresign } from "@/lib/client/upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { FormField, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";

export type ResourceItem = {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  groupId: string | null;
  tagIds: string[];
  url: string | null;
  createdAt: string;
};
type Named = { id: string; name: string };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function ResourceThumbnail({ item }: { item: ResourceItem }) {
  const [failed, setFailed] = useState(false);
  if (!item.url || !item.contentType.startsWith("image/") || failed) {
    return (
      <div className="flex h-28 items-center justify-center rounded-[8px] border-2 border-ink bg-paper">
        <Icon name="file" className="size-8 text-ink/40" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.url}
      alt=""
      onError={() => setFailed(true)}
      className="h-28 w-full rounded-[8px] border-2 border-ink object-cover"
    />
  );
}

export function ResourceLibrary({
  items: initialItems,
  groups: initialGroups,
  tags: initialTags,
  storageConfigured,
  canWrite,
}: {
  items: ResourceItem[];
  groups: Named[];
  tags: Named[];
  storageConfigured: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(initialItems);
  const [groups, setGroups] = useState(initialGroups);
  const [tags, setTags] = useState(initialTags);
  const [activeGroup, setActiveGroup] = useState<string | "all" | "ungrouped">("all");
  const [uploadGroup, setUploadGroup] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState("");
  const [newTag, setNewTag] = useState("");

  const groupName = (id: string | null) => (id ? groups.find((g) => g.id === id)?.name ?? "—" : "Ungrouped");
  const tagName = (id: string) => tags.find((t) => t.id === id)?.name ?? id;

  const filtered = useMemo(() => {
    if (activeGroup === "all") return items;
    if (activeGroup === "ungrouped") return items.filter((i) => !i.groupId);
    return items.filter((i) => i.groupId === activeGroup);
  }, [items, activeGroup]);

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    const up = await uploadViaPresign("/api/tenant/uploads/presign", file, { kind: "resource" });
    if ("error" in up) {
      setError(up.error);
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const res = await apiPost<{ resource: ResourceItem }>("/api/tenant/resources", {
      name: file.name,
      key: up.key,
      contentType: up.contentType,
      sizeBytes: up.size,
      groupId: uploadGroup || null,
    });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (res.error || !res.data) {
      setError(res.error?.message ?? "Could not save resource.");
      return;
    }
    setItems((prev) => [res.data!.resource, ...prev]);
    router.refresh();
  }

  async function createGroup() {
    if (!newGroup.trim()) return;
    const res = await apiPost<{ group: Named }>("/api/tenant/resource-groups", { name: newGroup.trim() });
    if (res.error || !res.data) return setError(res.error?.message ?? "Failed.");
    setGroups((prev) => [...prev, res.data!.group]);
    setNewGroup("");
  }

  async function createTag() {
    if (!newTag.trim()) return;
    const res = await apiPost<{ tag: Named }>("/api/tenant/resource-tags", { name: newTag.trim() });
    if (res.error || !res.data) return setError(res.error?.message ?? "Failed.");
    setTags((prev) => (prev.some((t) => t.id === res.data!.tag.id) ? prev : [...prev, res.data!.tag]));
    setNewTag("");
  }

  async function moveTo(item: ResourceItem, groupId: string | null) {
    const res = await apiPatch(`/api/tenant/resources/${item.id}`, { groupId });
    if (res.error) return setError(res.error.message);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, groupId } : i)));
  }

  async function toggleTag(item: ResourceItem, tagId: string) {
    const next = item.tagIds.includes(tagId) ? item.tagIds.filter((t) => t !== tagId) : [...item.tagIds, tagId];
    const res = await apiPatch(`/api/tenant/resources/${item.id}`, { tagIds: next });
    if (res.error) return setError(res.error.message);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, tagIds: next } : i)));
  }

  async function remove(item: ResourceItem) {
    if (!confirm("Delete this resource?")) return;
    const res = await apiDelete(`/api/tenant/resources/${item.id}`);
    if (res.error) return setError(res.error.message);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {!storageConfigured ? (
        <Card>
          <p className="text-sm font-bold text-red">Object storage is not configured — uploads are disabled.</p>
        </Card>
      ) : null}

      {canWrite && storageConfigured ? (
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <FormField label="Upload to group" htmlFor="up-group">
                <select
                  id="up-group"
                  value={uploadGroup}
                  onChange={(e) => setUploadGroup(e.target.value)}
                  className="w-full rounded-[10px] border-2 border-ink bg-card px-3 py-2.5 text-sm"
                >
                  <option value="">Ungrouped</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </FormField>
            </div>
            <input ref={fileRef} type="file" onChange={onFilePicked} className="hidden" />
            <Button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Icon name="upload" /> {uploading ? "Uploading…" : "Upload file"}
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-4">
            <div className="flex items-end gap-2">
              <TextInput value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="New group…" className="max-w-44" />
              <Button type="button" variant="outline" size="sm" onClick={createGroup}>Add group</Button>
            </div>
            <div className="flex items-end gap-2">
              <TextInput value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag…" className="max-w-44" />
              <Button type="button" variant="outline" size="sm" onClick={createTag}>Add tag</Button>
            </div>
          </div>
          {error ? <p className="mt-2 text-sm text-red">{error}</p> : null}
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(["all", "ungrouped"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setActiveGroup(g)}
            className={`rounded-full border-2 border-ink px-3 py-1 text-sm font-bold ${activeGroup === g ? "bg-ink text-paper" : "bg-card text-ink"}`}
          >
            {g === "all" ? "All" : "Ungrouped"}
          </button>
        ))}
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActiveGroup(g.id)}
            className={`rounded-full border-2 border-ink px-3 py-1 text-sm font-bold ${activeGroup === g.id ? "bg-ink text-paper" : "bg-card text-ink"}`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card><p className="text-sm text-stone-600">No resources here yet.</p></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <Card key={item.id} className="flex flex-col gap-2">
              <ResourceThumbnail item={item} />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold" title={item.name}>{item.name}</div>
                <div className="text-xs text-ink/50">{formatSize(item.sizeBytes)} · {groupName(item.groupId)}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {item.tagIds.map((t) => (
                  <Badge key={t}>{tagName(t)}</Badge>
                ))}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold underline">Open</a>
                ) : null}
                {canWrite ? (
                  <>
                    <select
                      value={item.groupId ?? ""}
                      onChange={(e) => moveTo(item, e.target.value || null)}
                      className="rounded border-2 border-ink bg-card px-1 py-0.5 text-xs"
                      title="Move to group"
                    >
                      <option value="">Ungrouped</option>
                      {groups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
                    </select>
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) toggleTag(item, e.target.value); }}
                      className="rounded border-2 border-ink bg-card px-1 py-0.5 text-xs"
                      title="Toggle tag"
                    >
                      <option value="">Tag…</option>
                      {tags.map((t) => (<option key={t.id} value={t.id}>{item.tagIds.includes(t.id) ? `✓ ${t.name}` : t.name}</option>))}
                    </select>
                    <button type="button" onClick={() => remove(item)} className="text-xs font-bold text-red">Delete</button>
                  </>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
