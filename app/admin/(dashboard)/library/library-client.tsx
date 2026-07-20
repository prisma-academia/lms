"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { apiGet, apiPatch, apiDelete, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/spinner";
import { TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { UploadDropzone } from "@/components/uploads/upload-dropzone";
import { UploadQueue } from "@/components/uploads/upload-queue";
import { LibraryToolbar } from "@/components/library/library-toolbar";
import { FolderTree, type FolderSelection } from "@/components/library/folder-tree";
import { MediaCard } from "@/components/library/media-card";
import { BulkActionBar } from "@/components/library/bulk-action-bar";
import { DetailsDrawer } from "@/components/library/details-drawer";
import { StorageMeter } from "@/components/library/storage-meter";
import { buildFolderTree, type LibraryItemView, type Named, type LibraryTagRef, type SortKey } from "@/components/library/types";
import { formatBytes } from "@/lib/media/format";
import { MEDIA_KIND_LABEL } from "@/lib/media/kind";

type FolderRow = { id: string; name: string; parentId: string | null; count: number };

export function LibraryClient({
  folders: initialFolders,
  tags: initialTags,
  storage,
  storageConfigured,
  canWrite,
  canAssign,
  totalCount,
  unfiledCount,
}: {
  folders: FolderRow[];
  tags: LibraryTagRef[];
  storage: { used: number; reserved: number; quota: number };
  storageConfigured: boolean;
  canWrite: boolean;
  canAssign: boolean;
  totalCount: number;
  unfiledCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [folders, setFolders] = useState(initialFolders);
  const [tags, setTags] = useState(initialTags);
  const [items, setItems] = useState<LibraryItemView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [newTag, setNewTag] = useState("");
  const lastClicked = useRef<string | null>(null);

  // Filter state lives in the URL so a filtered view is linkable and survives
  // a refresh — holding it in component state loses it on both.
  const folderSel = (params.get("folder") ?? "all") as FolderSelection;
  const q = params.get("q") ?? "";
  const kind = params.get("kind") ?? "all";
  const sort = (params.get("sort") ?? "recent") as SortKey;
  const view = (params.get("view") ?? "grid") as "grid" | "list";
  const activeTagIds = useMemo(() => params.getAll("tag"), [params]);

  const setParam = useCallback(
    (patch: Record<string, string | string[] | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        next.delete(k);
        if (Array.isArray(v)) v.forEach((x) => next.append(k, x));
        else if (v !== null && v !== "") next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (folderSel !== "all") sp.set("folderId", folderSel);
    if (q) sp.set("q", q);
    if (kind !== "all") sp.set("kind", kind);
    sp.set("sort", sort);
    activeTagIds.forEach((t) => sp.append("tagId", t));
    return sp.toString();
  }, [folderSel, q, kind, sort, activeTagIds]);

  const load = useCallback(
    async (append = false, afterCursor: string | null = null) => {
      setLoading(true);
      setError(null);
      const sp = new URLSearchParams(queryString);
      sp.set("take", "60");
      if (afterCursor) sp.set("cursor", afterCursor);
      const res = await apiGet<LibraryItemView[]>(`/api/tenant/library?${sp.toString()}`);
      setLoading(false);
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Could not load the library.");
        return;
      }
      setItems((prev) => (append ? [...prev, ...res.data!] : res.data!));
      // A short page means there is nothing after it.
      setCursor(res.data.length === 60 ? res.data[res.data.length - 1].id : null);
      // Selection is cleared here rather than synchronously in the effect:
      // the ids in it refer to the previous result set, and clearing before the
      // await would render the grid twice on every filter change.
      if (!append) setSelected(new Set());
    },
    [queryString]
  );

  useEffect(() => {
    // `load` flips `loading` before awaiting, which the compiler flags as a
    // cascading render. That extra render IS the point here — it swaps the grid
    // for a spinner while the new filter's results are in flight. Suppressed
    // rather than deferred, because deferring it shows stale rows as if they
    // matched the new filter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(false, null);
  }, [load]);

  const openItem = items.find((i) => i.id === openId) ?? null;

  function toggleSelect(id: string, e?: React.MouseEvent) {
    setSelected((prev) => {
      const next = new Set(prev);
      // Shift-click extends from the last clicked row, like a file manager.
      if (e?.shiftKey && lastClicked.current) {
        const from = items.findIndex((i) => i.id === lastClicked.current);
        const to = items.findIndex((i) => i.id === id);
        if (from !== -1 && to !== -1) {
          for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next.add(items[i].id);
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastClicked.current = id;
  }

  // Keyboard: select-all and clear, scoped to when no field has focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable;
      if (typing) return;
      if (e.key === "Escape") setSelected(new Set());
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(items.map((i) => i.id)));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items]);

  async function createFolder() {
    const name = newFolder.trim();
    if (!name) return;
    const res = await apiPost<{ folder: { id: string; name: string; parentId: string | null } }>(
      "/api/tenant/library/folders",
      { name }
    );
    if (res.error || !res.data) return setError(res.error?.message ?? "Could not create the folder.");
    setFolders((prev) => [...prev, { ...res.data!.folder, count: 0 }]);
    setNewFolder("");
  }

  async function createTag() {
    const name = newTag.trim();
    if (!name) return;
    const res = await apiPost<{ tag: LibraryTagRef }>("/api/tenant/library/tags", { name });
    if (res.error || !res.data) return setError(res.error?.message ?? "Could not create the tag.");
    setTags((prev) => (prev.some((t) => t.id === res.data!.tag.id) ? prev : [...prev, res.data!.tag]));
    setNewTag("");
  }

  async function bulkMove(folderId: string | null) {
    const ids = [...selected];
    await Promise.all(ids.map((id) => apiPatch(`/api/tenant/library/${id}`, { folderId })));
    setSelected(new Set());
    void load(false, null);
    router.refresh();
  }

  async function bulkTag(tagId: string, add: boolean) {
    const ids = [...selected];
    await Promise.all(
      ids.map((id) => {
        const item = items.find((i) => i.id === id);
        if (!item) return Promise.resolve();
        const current = item.tags.map((t) => t.tag.id);
        const next = add ? [...new Set([...current, tagId])] : current.filter((t) => t !== tagId);
        return apiPatch(`/api/tenant/library/${id}`, { tagIds: next });
      })
    );
    setSelected(new Set());
    void load(false, null);
  }

  async function bulkDelete() {
    const ids = [...selected];
    await Promise.all(ids.map((id) => apiDelete(`/api/tenant/library/${id}`)));
    setSelected(new Set());
    setOpenId(null);
    void load(false, null);
    router.refresh();
  }

  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const folderOptions: Named[] = folders.map((f) => ({ id: f.id, name: f.name }));
  const overQuota = storage.used + storage.reserved >= storage.quota;
  const hasFilters = !!q || kind !== "all" || activeTagIds.length > 0 || folderSel !== "all";

  return (
    <div className="flex flex-col gap-4">
      <StorageMeter usedBytes={storage.used} reservedBytes={storage.reserved} quotaBytes={storage.quota} />

      {canWrite ? (
        <>
          <UploadDropzone
            defaultMeta={{ folderId: folderSel !== "all" && folderSel !== "none" ? folderSel : null }}
            disabled={!storageConfigured || overQuota}
            disabledReason={
              !storageConfigured
                ? "Object storage is not configured — uploads are disabled."
                : `Storage is full (${formatBytes(storage.quota)}). Remove files or upgrade your plan.`
            }
          />
          <UploadQueue folders={folderOptions} tags={tags} />
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="flex flex-col gap-3">
          <Card className="p-2">
            <FolderTree
              nodes={tree}
              selected={folderSel}
              onSelect={(id) => setParam({ folder: id === "all" ? null : id })}
              totalCount={totalCount}
              unfiledCount={unfiledCount}
              onDropItems={canWrite ? (folderId) => void bulkMove(folderId) : undefined}
            />
          </Card>

          {canWrite ? (
            <Card className="flex flex-col gap-2 p-2">
              <div className="flex items-end gap-1.5">
                <TextInput
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void createFolder())}
                  placeholder="New folder…"
                  aria-label="New folder name"
                />
                <Button type="button" size="icon-sm" variant="outline" aria-label="Add folder" onClick={() => void createFolder()}>
                  <Icon name="plus" />
                </Button>
              </div>
              <div className="flex items-end gap-1.5">
                <TextInput
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void createTag())}
                  placeholder="New tag…"
                  aria-label="New tag name"
                />
                <Button type="button" size="icon-sm" variant="outline" aria-label="Add tag" onClick={() => void createTag()}>
                  <Icon name="plus" />
                </Button>
              </div>
            </Card>
          ) : null}
        </aside>

        <div className="min-w-0">
          <LibraryToolbar
            q={q}
            onQChange={(v) => setParam({ q: v || null })}
            kind={kind}
            onKindChange={(v) => setParam({ kind: v === "all" ? null : v })}
            sort={sort}
            onSortChange={(v) => setParam({ sort: v === "recent" ? null : v })}
            view={view}
            onViewChange={(v) => setParam({ view: v === "grid" ? null : v })}
            tags={tags}
            activeTagIds={activeTagIds}
            onToggleTag={(id) =>
              setParam({ tag: activeTagIds.includes(id) ? activeTagIds.filter((t) => t !== id) : [...activeTagIds, id] })
            }
            onClearFilters={() => setParam({ q: null, kind: null, tag: null, folder: null })}
            hasFilters={hasFilters}
          />

          {error ? <p className="mt-3 text-sm font-bold text-destructive">{error}</p> : null}

          {loading && items.length === 0 ? (
            <div className="mt-6 flex justify-center">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon="layers"
                title={hasFilters ? "Nothing matches those filters" : "The library is empty"}
              >
                {hasFilters
                  ? "Try a different search, type or tag."
                  : canWrite
                    ? "Upload your first file to get started."
                    : "No files have been added yet."}
              </EmptyState>
            </div>
          ) : view === "grid" ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  selectionMode={selected.size > 0}
                  onToggleSelect={(e) => {
                    e.stopPropagation();
                    toggleSelect(item.id, e);
                  }}
                  onOpen={() => setOpenId(item.id)}
                />
              ))}
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-1.5">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(item.id)}
                    className="flex w-full items-center gap-3 rounded-[10px] border-2 border-border bg-card p-2 text-left hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{item.title || item.name}</span>
                    <span className="num shrink-0 text-xs text-muted-foreground">
                      {MEDIA_KIND_LABEL[item.mediaKind]} · {formatBytes(item.sizeBytes)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {cursor ? (
            <div className="mt-4 flex justify-center">
              <Button type="button" variant="outline" disabled={loading} onClick={() => void load(true, cursor)}>
                {loading ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}

          <BulkActionBar
            count={selected.size}
            folders={folderOptions}
            tags={tags}
            onMove={(f) => void bulkMove(f)}
            onTag={(t, add) => void bulkTag(t, add)}
            onDelete={() => void bulkDelete()}
            onClear={() => setSelected(new Set())}
          />
        </div>
      </div>

      <DetailsDrawer
        item={openItem}
        folders={folderOptions}
        tags={tags}
        canWrite={canWrite}
        canAssign={canAssign}
        onClose={() => setOpenId(null)}
        onChanged={(patch) =>
          setItems((prev) => prev.map((i) => (i.id === openId ? { ...i, ...patch } : i)))
        }
        onDeleted={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
      />
    </div>
  );
}
