"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { apiGet, apiPatch, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Spinner } from "@/components/spinner";
import { Icon } from "@/components/icon";
import { UploadDropzone } from "@/components/uploads/upload-dropzone";
import { UploadQueue } from "@/components/uploads/upload-queue";
import { useUploads } from "@/lib/client/uploads/use-uploads";
import { LibraryToolbar } from "@/components/library/library-toolbar";
import { FolderTree, type FolderSelection } from "@/components/library/folder-tree";
import { MediaCard } from "@/components/library/media-card";
import { BulkActionBar } from "@/components/library/bulk-action-bar";
import { DetailsDrawer } from "@/components/library/details-drawer";
import { StorageMeter } from "@/components/library/storage-meter";
import {
  NewFolderDialog,
  NewTagDialog,
  UploadFilesDialog,
} from "@/components/library/library-dialogs";
import { buildFolderTree, type LibraryItemView, type Named, type LibraryTagRef, type SortKey } from "@/components/library/types";
import { formatBytes } from "@/lib/media/format";
import { MEDIA_KIND_LABEL } from "@/lib/media/kind";

type FolderRow = { id: string; name: string; parentId: string | null; count: number };
type Tab = "files" | "uploads" | "organise";

const PAGE_SIZE = 60;

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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const lastClicked = useRef<string | null>(null);

  const upload = useUploads();

  // Filter state lives in the URL so a filtered view is linkable and survives
  // a refresh — holding it in component state loses it on both. The tab is
  // there too, so "show me the upload queue" is a link like any other view.
  const folderSel = (params.get("folder") ?? "all") as FolderSelection;
  const q = params.get("q") ?? "";
  const kind = params.get("kind") ?? "all";
  const sort = (params.get("sort") ?? "recent") as SortKey;
  const view = (params.get("view") ?? "grid") as "grid" | "list";
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "uploads" || tabParam === "organise" ? tabParam : "files";
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

  const setTab = useCallback((next: Tab) => setParam({ tab: next === "files" ? null : next }), [setParam]);

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
      sp.set("take", String(PAGE_SIZE));
      if (afterCursor) sp.set("cursor", afterCursor);
      const res = await apiGet<LibraryItemView[]>(`/api/tenant/library?${sp.toString()}`);
      setLoading(false);
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Could not load the library.");
        return;
      }
      setItems((prev) => (append ? [...prev, ...res.data!] : res.data!));
      // A short page means there is nothing after it.
      setCursor(res.data.length === PAGE_SIZE ? res.data[res.data.length - 1].id : null);
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

  // Keyboard: select-all and clear, scoped to the Files tab and to when no
  // field has focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (tab !== "files") return;
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
  }, [items, tab]);

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
  const currentFolderId = folderSel !== "all" && folderSel !== "none" ? folderSel : null;
  const uploadPct =
    upload.totalBytes > 0 ? Math.min(100, Math.round((upload.sentBytes / upload.totalBytes) * 100)) : 0;

  const tabs: { value: Tab; label: string }[] = [
    { value: "files", label: "Files" },
    { value: "uploads", label: upload.tasks.length > 0 ? `Uploads (${upload.tasks.length})` : "Uploads" },
    { value: "organise", label: "Organise" },
  ];

  function browseFolder(id: FolderSelection) {
    setParam({ folder: id === "all" ? null : id, tab: null });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56 flex-1">
          <StorageMeter usedBytes={storage.used} reservedBytes={storage.reserved} quotaBytes={storage.quota} />
        </div>
        {canWrite ? (
          <Button type="button" onClick={() => setUploadOpen(true)}>
            <Icon name="upload" /> Upload files
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Tab> ariaLabel="Library sections" options={tabs} value={tab} onChange={setTab} />
        {/* Progress stays visible from any tab — the queue itself is one tab away. */}
        {upload.activeCount > 0 && tab !== "uploads" ? (
          <button
            type="button"
            onClick={() => setTab("uploads")}
            className="flex min-w-48 flex-1 items-center gap-2 rounded-[10px] border-2 border-border bg-card px-3 py-1.5 text-left hover:bg-accent"
          >
            <span className="num shrink-0 text-xs font-bold">Uploading {upload.activeCount}</span>
            <span className="min-w-0 flex-1">
              <ProgressBar value={uploadPct} size="sm" color="var(--info)" aria-label="Upload progress" />
            </span>
            <span className="num shrink-0 text-xs text-muted-foreground">{uploadPct}%</span>
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm font-bold text-destructive">{error}</p> : null}

      {tab === "files" ? (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="min-w-0">
            <Card className="p-2">
              {/* Capped so a tenant with 60 folders does not push the grid down. */}
              <div className="max-h-[18rem] overflow-y-auto lg:max-h-[min(60vh,32rem)]">
                <FolderTree
                  nodes={tree}
                  selected={folderSel}
                  onSelect={browseFolder}
                  totalCount={totalCount}
                  unfiledCount={unfiledCount}
                  onDropItems={canWrite ? (folderId) => void bulkMove(folderId) : undefined}
                />
              </div>
              {canWrite ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-1 w-full justify-start"
                  onClick={() => setFolderDialogOpen(true)}
                >
                  <Icon name="plus" /> New folder
                </Button>
              ) : null}
            </Card>
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

            {/* One scroll viewport for the results, so the toolbar and the
                selection bar stay put however many files match. */}
            <div className="mt-3 max-h-[min(62vh,40rem)] overflow-y-auto [scrollbar-gutter:stable]">
              {loading && items.length === 0 ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : items.length === 0 ? (
                <EmptyState
                  icon="layers"
                  title={hasFilters ? "Nothing matches those filters" : "The library is empty"}
                  action={
                    hasFilters ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setParam({ q: null, kind: null, tag: null, folder: null })}
                      >
                        Clear filters
                      </Button>
                    ) : canWrite ? (
                      <Button type="button" size="sm" onClick={() => setUploadOpen(true)}>
                        <Icon name="upload" /> Upload files
                      </Button>
                    ) : undefined
                  }
                >
                  {hasFilters
                    ? "Try a different search, type or tag."
                    : canWrite
                      ? "Upload your first file to get started."
                      : "No files have been added yet."}
                </EmptyState>
              ) : view === "grid" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
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
                <ul className="flex flex-col gap-1.5">
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
            </div>

            <div className="num mt-2 text-xs font-bold text-muted-foreground" aria-live="polite">
              {items.length === 0
                ? "No files"
                : `${items.length} file${items.length === 1 ? "" : "s"}${cursor ? " loaded — more available" : ""}`}
            </div>

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
      ) : null}

      {tab === "uploads" ? (
        <div className="flex flex-col gap-4">
          {canWrite ? (
            <UploadDropzone
              defaultMeta={{ folderId: currentFolderId }}
              disabled={!storageConfigured || overQuota}
              disabledReason={
                !storageConfigured
                  ? "Object storage is not configured — uploads are disabled."
                  : `Storage is full (${formatBytes(storage.quota)}). Remove files or upgrade your plan.`
              }
            />
          ) : null}
          <UploadQueue folders={folderOptions} tags={tags} />
          {upload.tasks.length === 0 ? (
            <Card>
              <EmptyState icon="upload" title="Nothing in the queue">
                {canWrite
                  ? "Drop files above — uploads resume automatically if a large transfer is interrupted."
                  : "You do not have permission to upload files."}
              </EmptyState>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "organise" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-heading text-base">Folders</h2>
                <p className="num text-xs text-muted-foreground">
                  {folders.length} folder{folders.length === 1 ? "" : "s"} · {unfiledCount} unfiled
                </p>
              </div>
              {canWrite ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setFolderDialogOpen(true)}>
                  <Icon name="plus" /> New
                </Button>
              ) : null}
            </div>
            <div className="max-h-[min(50vh,26rem)] overflow-y-auto rounded-[10px] border-2 border-border p-1">
              <FolderTree
                nodes={tree}
                selected={folderSel}
                onSelect={browseFolder}
                totalCount={totalCount}
                unfiledCount={unfiledCount}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Pick a folder to browse it. Drag files onto a folder in the Files tab to move them.
            </p>
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-heading text-base">Tags</h2>
                <p className="num text-xs text-muted-foreground">
                  {tags.length} tag{tags.length === 1 ? "" : "s"}
                </p>
              </div>
              {canWrite ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setTagDialogOpen(true)}>
                  <Icon name="plus" /> New
                </Button>
              ) : null}
            </div>
            <div className="max-h-[min(50vh,26rem)] overflow-y-auto rounded-[10px] border-2 border-border p-2">
              {tags.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">
                  No tags yet. Tags cut across folders — one file can carry several.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setParam({ tag: [t.id], folder: null, tab: null })}
                      className="rounded-full border-2 border-border bg-card px-2.5 py-0.5 text-xs font-bold transition-transform hover:-translate-y-px"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Pick a tag to browse everything carrying it.</p>
          </Card>
        </div>
      ) : null}

      {canWrite ? (
        <>
          <UploadFilesDialog
            // Remounts when the browsed folder changes so the destination
            // select opens on the folder you are looking at.
            key={currentFolderId ?? "root"}
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            folders={folderOptions}
            defaultFolderId={currentFolderId}
            storageConfigured={storageConfigured}
            overQuota={overQuota}
            quotaBytes={storage.quota}
            onShowQueue={() => setTab("uploads")}
          />
          <NewFolderDialog
            open={folderDialogOpen}
            onOpenChange={setFolderDialogOpen}
            folders={folderOptions}
            defaultParentId={currentFolderId}
            onCreated={(folder) => setFolders((prev) => [...prev, { ...folder, count: 0 }])}
          />
          <NewTagDialog
            open={tagDialogOpen}
            onOpenChange={setTagDialogOpen}
            onCreated={(tag) => setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]))}
          />
        </>
      ) : null}

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
