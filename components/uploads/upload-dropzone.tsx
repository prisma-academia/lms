"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useUploadManager } from "@/lib/client/uploads/use-uploads";
import type { UploadMeta } from "@/lib/client/uploads/types";

/**
 * Drag-and-drop target with a real Browse button.
 *
 * The button is not optional: drag-and-drop is unreachable by keyboard and by
 * most assistive tech, so a drop-only zone is inaccessible.
 */
export function UploadDropzone({
  defaultMeta,
  disabled,
  disabledReason,
}: {
  defaultMeta?: Partial<UploadMeta>;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const manager = useUploadManager();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const addFiles = useCallback(
    (files: File[], handles?: (FileSystemFileHandle | undefined)[]) => {
      if (disabled || files.length === 0) return;
      manager.add(files, defaultMeta, handles);
    },
    [manager, defaultMeta, disabled]
  );

  /** Prefer showOpenFilePicker so Chromium can resume after a reload without a re-pick. */
  const browse = useCallback(async () => {
    if (disabled) return;
    if (typeof window !== "undefined" && window.showOpenFilePicker) {
      try {
        const handles = await window.showOpenFilePicker({ multiple: true });
        const files = await Promise.all(handles.map((h) => h.getFile()));
        addFiles(files, handles);
        return;
      } catch {
        // User dismissed the picker, or the API is unavailable in this context.
        return;
      }
    }
    inputRef.current?.click();
  }, [addFiles, disabled]);

  /** Recursively flatten a dropped directory. */
  const walkEntry = useCallback(async (entry: FileSystemEntry, out: File[]): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) =>
        (entry as FileSystemFileEntry).file(resolve, () => resolve(null))
      );
      if (file) out.push(file);
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve) =>
          reader.readEntries(resolve, () => resolve([]))
        );
        if (batch.length === 0) break;
        for (const child of batch) await walkEntry(child, out);
      }
    }
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (disabled) return;

      const items = Array.from(e.dataTransfer.items ?? []);
      const entries = items
        .map((i) => (i.kind === "file" ? i.webkitGetAsEntry?.() : null))
        .filter(Boolean) as FileSystemEntry[];

      if (entries.length > 0) {
        const out: File[] = [];
        for (const entry of entries) await walkEntry(entry, out);
        addFiles(out);
        return;
      }
      addFiles(Array.from(e.dataTransfer.files ?? []));
    },
    [addFiles, disabled, walkEntry]
  );

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current++;
        if (!disabled) setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current--;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDrop={onDrop}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData?.files ?? []);
        if (files.length > 0) addFiles(files);
      }}
      className={cn(
        "rounded-[14px] border-2 border-dashed border-border bg-card p-6 text-center transition-colors",
        dragging && "border-primary bg-accent",
        disabled && "opacity-60"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <Icon name="upload" className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-2 font-heading text-base">
        {disabled ? (disabledReason ?? "Uploads unavailable") : "Drop files here"}
      </p>
      {!disabled ? (
        <>
          <p id="dropzone-hint" className="mt-1 text-sm text-muted-foreground">
            Video, audio, PDFs, images and documents. Up to 2 GB each — large uploads resume if interrupted.
          </p>
          <Button type="button" onClick={browse} className="mt-4" aria-describedby="dropzone-hint">
            <Icon name="plus" /> Browse files
          </Button>
        </>
      ) : null}
    </div>
  );
}
