"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Card } from "@/components/shell";
import { SelectInput } from "@/components/form-field";
import { formatBytes, formatRate, formatEta } from "@/lib/media/format";
import { useUploads, useUploadManager } from "@/lib/client/uploads/use-uploads";
import { UploadRow } from "./upload-row";

export type Named = { id: string; name: string };

export function UploadQueue({
  folders,
  tags: initialTags,
}: {
  folders: Named[];
  tags: Named[];
}) {
  const { tasks, totalBytes, sentBytes, activeCount, rate } = useUploads();
  const manager = useUploadManager();
  const [tags, setTags] = useState(initialTags);
  const [bulkFolder, setBulkFolder] = useState("");

  if (tasks.length === 0) return null;

  const pct = totalBytes > 0 ? Math.min(100, Math.round((sentBytes / totalBytes) * 100)) : 0;
  const remaining = rate > 0 ? (totalBytes - sentBytes) / rate : 0;
  const finished = tasks.filter((t) => t.status === "done" || t.status === "aborted").length;
  const anyActive = tasks.some((t) => t.status === "uploading" || t.status === "creating");
  const anyPaused = tasks.some((t) => t.status === "paused" || t.status === "error");

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-base">Uploads</h2>
          {/* Announce transitions, not every percentage tick. */}
          <p className="num text-xs text-muted-foreground" aria-live="polite">
            {activeCount} of {tasks.length} active · {formatBytes(sentBytes)} of {formatBytes(totalBytes)}
            {rate > 0 ? ` · ${formatRate(rate)}` : ""}
            {remaining > 0 ? ` · ${formatEta(remaining)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {anyActive ? (
            <Button type="button" size="sm" variant="outline" onClick={() => manager.pauseAll()}>
              Pause all
            </Button>
          ) : null}
          {anyPaused ? (
            <Button type="button" size="sm" variant="outline" onClick={() => manager.resumeAll()}>
              Resume all
            </Button>
          ) : null}
          {finished > 0 ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => manager.clearFinished()}>
              Clear finished
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <ProgressBar value={pct} aria-label="Overall upload progress" />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t-2 border-border pt-3">
        <div className="w-56">
          <SelectInput
            aria-label="Move all queued uploads to a folder"
            value={bulkFolder}
            onChange={(e) => {
              setBulkFolder(e.target.value);
              manager.setMetaForAll({ folderId: e.target.value || null });
            }}
            allowEmpty
            placeholder="Apply folder to all…"
            options={folders.map((f) => ({ value: f.id, label: f.name }))}
          />
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {tasks.map((t) => (
          <UploadRow
            key={t.id}
            task={t}
            folders={folders}
            tags={tags}
            onTagCreated={(tag) => setTags((prev) => (prev.some((x) => x.id === tag.id) ? prev : [...prev, tag]))}
          />
        ))}
      </ul>
    </Card>
  );
}
