"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Icon } from "@/components/icon";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatBytes } from "@/lib/media/format";
import { useUploadManager } from "@/lib/client/uploads/use-uploads";
import type { UploadTask } from "@/lib/client/uploads/types";
import { UploadMetaForm } from "./upload-meta-form";
import type { Named } from "./upload-queue";

const STATUS_LABEL: Record<UploadTask["status"], string> = {
  queued: "Queued",
  creating: "Starting",
  uploading: "Uploading",
  paused: "Paused",
  error: "Failed",
  completing: "Finishing",
  done: "Done",
  aborted: "Cancelled",
  "needs-file": "Needs file",
};

/** Semantic status tokens, never --chart-N: these mean good/bad, not "different". */
const STATUS_COLOR: Record<UploadTask["status"], string> = {
  queued: "var(--muted-foreground)",
  creating: "var(--info)",
  uploading: "var(--info)",
  paused: "var(--warning)",
  error: "var(--destructive)",
  completing: "var(--info)",
  done: "var(--success)",
  aborted: "var(--muted-foreground)",
  "needs-file": "var(--warning)",
};

export function UploadRow({
  task,
  folders,
  tags,
  onTagCreated,
  onPreview,
}: {
  task: UploadTask;
  folders: Named[];
  tags: Named[];
  onTagCreated: (tag: Named) => void;
  /** Opens the finished item. Omit on surfaces with no preview host. */
  onPreview?: (itemId: string) => void;
}) {
  const manager = useUploadManager();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  /** Why re-selecting the file did not work, shown beside the button that was pressed. */
  const [refileError, setRefileError] = useState<string | null>(null);
  const refileRef = useRef<HTMLInputElement>(null);

  const sent = task.parts.reduce((n, p) => n + (p.status === "done" ? p.size : p.sent), 0);
  const total = task.fingerprint.size;
  const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;

  // Preview straight from the in-memory File — no round trip to storage.
  // Derived with useMemo rather than set from an effect: setState inside an
  // effect makes every row render twice, which is real cost across a long queue.
  const thumb = useMemo(
    () => (task.file && task.file.type.startsWith("image/") ? URL.createObjectURL(task.file) : null),
    [task.file]
  );
  useEffect(() => {
    if (!thumb) return;
    return () => URL.revokeObjectURL(thumb);
  }, [thumb]);

  const busy = task.status === "uploading" || task.status === "creating" || task.status === "completing";

  return (
    <li className="rounded-[12px] border-2 border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border-2 border-border bg-background">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <Icon name="file" className="size-5 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold" title={task.fingerprint.name}>
              {task.fingerprint.name}
            </span>
            <Badge color={STATUS_COLOR[task.status]}>{STATUS_LABEL[task.status]}</Badge>
          </div>

          <div className="num mt-1 text-xs text-muted-foreground">
            {formatBytes(sent)} of {formatBytes(total)} · {pct}%
          </div>

          {task.status !== "done" && task.status !== "aborted" ? (
            <div className="mt-2">
              <ProgressBar
                value={pct}
                size="sm"
                color={STATUS_COLOR[task.status]}
                label={`Upload progress for ${task.fingerprint.name}`}
              />
            </div>
          ) : null}

          {task.error ? (
            <p role="alert" className="mt-2 text-xs font-bold text-destructive">
              {task.error.message}
            </p>
          ) : null}

          {task.status === "needs-file" ? (
            <div className="mt-2 rounded-[8px] border-2 border-dashed border-border bg-background p-2">
              <p className="text-xs text-muted-foreground">
                This upload was interrupted. Choose the same file again to carry on from {pct}%.
              </p>
              <input
                ref={refileRef}
                type="file"
                className="hidden"
                aria-label={`Choose ${task.fingerprint.name} again`}
                tabIndex={-1}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setRefileError(null);
                  if (manager.isStale(task.id, f)) {
                    const yes = await confirm({
                      title: "This file has changed. Resume anyway?",
                      description:
                        "The file you chose is not the same as when the upload started. Carrying on would join two different versions and may leave a damaged file. To be safe, cancel this upload and start it again.",
                      confirmLabel: "Resume anyway",
                      destructive: true,
                    });
                    if (!yes) return;
                  }
                  const res = manager.reattach(task.id, f);
                  if (!res.ok) setRefileError(res.error ?? "That file could not be used to continue this upload.");
                  else manager.start(task.id);
                }}
              />
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => refileRef.current?.click()}>
                Choose the file again
              </Button>
              {refileError ? (
                <p role="alert" className="mt-2 text-xs font-bold text-destructive">
                  {refileError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {task.status === "done" && task.itemId && onPreview ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Preview ${task.fingerprint.name}`}
              title="Preview"
              onClick={() => onPreview(task.itemId!)}
            >
              <Icon name="eye" />
            </Button>
          ) : null}
          {busy ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Pause upload of ${task.fingerprint.name}`}
              title="Pause"
              onClick={() => manager.pause(task.id)}
            >
              <Icon name="pause" />
            </Button>
          ) : null}
          {task.status === "paused" ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Resume upload of ${task.fingerprint.name}`}
              title="Resume"
              onClick={() => manager.start(task.id)}
            >
              <Icon name="play" />
            </Button>
          ) : null}
          {task.status === "error" && task.error?.retryable ? (
            <Button type="button" size="sm" variant="outline" onClick={() => manager.start(task.id)}>
              Retry
            </Button>
          ) : null}
          {task.status !== "done" ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Cancel upload of ${task.fingerprint.name}`}
              title="Cancel"
              onClick={() => void manager.cancel(task.id)}
            >
              <Icon name="x" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`${open ? "Hide" : "Edit"} details for ${task.fingerprint.name}`}
            title={open ? "Hide details" : "Edit details"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? "chevron-down" : "chevron-right"} />
          </Button>
        </div>
      </div>

      {open ? (
        <div className="mt-3 border-t-2 border-border pt-3">
          <UploadMetaForm task={task} folders={folders} tags={tags} onTagCreated={onTagCreated} />
        </div>
      ) : null}
    </li>
  );
}
