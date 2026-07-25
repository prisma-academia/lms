"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FormField, TextInput, SelectInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { UploadDropzone } from "@/components/uploads/upload-dropzone";
import { useUploads } from "@/lib/client/uploads/use-uploads";
import { formatBytes } from "@/lib/media/format";
import type { Named, LibraryTagRef } from "./types";

/**
 * The library's create/upload flows as modals.
 *
 * They used to be permanently-mounted panels stacked above the grid, so the
 * files — the reason you open the page — started below the fold. A modal is the
 * right shape for a short, one-off task that interrupts browsing.
 */

export type FolderRef = { id: string; name: string; parentId: string | null };

export function NewFolderDialog({
  open,
  onOpenChange,
  folders,
  defaultParentId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: Named[];
  /** Pre-selects the folder the browser is currently filtered to. */
  defaultParentId: string | null;
  onCreated: (folder: FolderRef) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Keyed so each opening starts from a clean form instead of the last attempt. */}
      {open ? (
        <NewFolderBody
          key={defaultParentId ?? "root"}
          folders={folders}
          defaultParentId={defaultParentId}
          onOpenChange={onOpenChange}
          onCreated={onCreated}
        />
      ) : null}
    </Dialog>
  );
}

function NewFolderBody({
  folders,
  defaultParentId,
  onOpenChange,
  onCreated,
}: {
  folders: Named[];
  defaultParentId: string | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (folder: FolderRef) => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(defaultParentId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the folder a name.");
    setSaving(true);
    setError(null);
    const res = await apiPost<{ folder: FolderRef }>("/api/tenant/library/folders", {
      name: trimmed,
      parentId: parentId || null,
    });
    setSaving(false);
    if (res.error || !res.data) return setError(res.error?.message ?? "Could not create the folder.");
    onCreated(res.data.folder);
    onOpenChange(false);
  }

  return (
    <DialogContent className="max-w-md">
      <DialogTitle>New folder</DialogTitle>
      <DialogDescription>Folders group files for browsing and for bulk assignment.</DialogDescription>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <FormField label="Name" htmlFor="new-folder-name">
          <TextInput
            id="new-folder-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Term 1 lectures"
          />
        </FormField>
        <FormField label="Inside" htmlFor="new-folder-parent" hint="Leave empty for a top-level folder.">
          <SelectInput
            id="new-folder-parent"
            allowEmpty
            placeholder="Top level"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            options={folders.map((f) => ({ value: f.id, label: f.name }))}
          />
        </FormField>
        {error ? <p className="text-sm font-bold text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create folder"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

export function NewTagDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (tag: LibraryTagRef) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <NewTagBody onOpenChange={onOpenChange} onCreated={onCreated} /> : null}
    </Dialog>
  );
}

function NewTagBody({
  onOpenChange,
  onCreated,
}: {
  onOpenChange: (open: boolean) => void;
  onCreated: (tag: LibraryTagRef) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the tag a name.");
    setSaving(true);
    setError(null);
    const res = await apiPost<{ tag: LibraryTagRef }>("/api/tenant/library/tags", { name: trimmed });
    setSaving(false);
    if (res.error || !res.data) return setError(res.error?.message ?? "Could not create the tag.");
    onCreated(res.data.tag);
    onOpenChange(false);
  }

  return (
    <DialogContent className="max-w-md">
      <DialogTitle>New tag</DialogTitle>
      <DialogDescription>
        Tags cut across folders — one file can carry several.
      </DialogDescription>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <FormField label="Name" htmlFor="new-tag-name">
          <TextInput
            id="new-tag-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Handout"
          />
        </FormField>
        {error ? <p className="text-sm font-bold text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create tag"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

export function UploadFilesDialog({
  open,
  onOpenChange,
  folders,
  defaultFolderId,
  storageConfigured,
  overQuota,
  quotaBytes,
  onShowQueue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: Named[];
  defaultFolderId: string | null;
  storageConfigured: boolean;
  overQuota: boolean;
  quotaBytes: number;
  /** Switch the page to the Uploads tab so progress is visible. */
  onShowQueue: () => void;
}) {
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const { tasks, activeCount } = useUploads();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogTitle>Upload files</DialogTitle>
        <DialogDescription>
          Uploads keep running while you browse — close this and watch progress on the Uploads tab.
        </DialogDescription>

        <div className="mt-4 flex flex-col gap-4">
          <FormField label="Add to folder" htmlFor="upload-folder">
            <SelectInput
              id="upload-folder"
              allowEmpty
              placeholder="Unfiled"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              options={folders.map((f) => ({ value: f.id, label: f.name }))}
            />
          </FormField>

          <UploadDropzone
            defaultMeta={{ folderId: folderId || null }}
            disabled={!storageConfigured || overQuota}
            disabledReason={
              !storageConfigured
                ? "Object storage is not configured — uploads are disabled."
                : `Storage is full (${formatBytes(quotaBytes)}). Remove files or upgrade your plan.`
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="num text-xs font-bold text-muted-foreground" aria-live="polite">
              {tasks.length === 0
                ? "Nothing queued yet."
                : `${tasks.length} queued · ${activeCount} uploading`}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                type="button"
                disabled={tasks.length === 0}
                onClick={() => {
                  onOpenChange(false);
                  onShowQueue();
                }}
              >
                <Icon name="upload" /> View queue
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
