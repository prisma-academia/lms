"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TextInput, SelectInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import type { Named, LibraryTagRef } from "./types";

/**
 * Sticky bar for actions on the current selection.
 *
 * Delete requires typing the count rather than a window.confirm: bulk delete of
 * media is unrecoverable, and a reflexive OK-click is too cheap for it.
 */
export function BulkActionBar({
  count,
  folders,
  tags,
  onMove,
  onTag,
  onDelete,
  onClear,
}: {
  count: number;
  folders: Named[];
  tags: LibraryTagRef[];
  onMove: (folderId: string | null) => void;
  onTag: (tagId: string, add: boolean) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  if (count === 0) return null;
  const expected = String(count);

  return (
    <>
      <div className="safe-b sticky bottom-0 z-30 -mx-1 mt-3 rounded-[12px] border-2 border-border bg-card p-2 shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          <span className="num px-1 text-sm font-bold" aria-live="polite">
            {count} selected
          </span>

          <div className="w-44">
            <SelectInput
              aria-label="Move selection to folder"
              value=""
              onChange={(e) => onMove(e.target.value === "__none" ? null : e.target.value)}
              allowEmpty
              placeholder="Move to…"
              options={[
                { value: "__none", label: "Unfiled" },
                ...folders.map((f) => ({ value: f.id, label: f.name })),
              ]}
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                <Icon name="tag" /> Tag
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="mb-2 text-xs font-bold text-muted-foreground">Add or remove a tag</p>
              <div className="flex flex-col gap-1">
                {tags.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tags yet.</p>
                ) : (
                  tags.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{t.name}</span>
                      <span className="flex gap-1">
                        <Button type="button" size="xs" variant="outline" onClick={() => onTag(t.id, true)}>
                          Add
                        </Button>
                        <Button type="button" size="xs" variant="ghost" onClick={() => onTag(t.id, false)}>
                          Remove
                        </Button>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => {
              setTyped("");
              setConfirming(true);
            }}
          >
            <Icon name="trash" /> Delete
          </Button>

          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-md">
          <DialogTitle>Delete {count} file{count === 1 ? "" : "s"}?</DialogTitle>
          <DialogDescription>
            The files are removed from storage permanently. Anyone they were assigned to loses access
            immediately. This cannot be undone.
          </DialogDescription>
          <label className="mt-4 block text-sm font-bold" htmlFor="confirm-count">
            Type <span className="num">{expected}</span> to confirm
          </label>
          <TextInput
            id="confirm-count"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1"
            autoComplete="off"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={typed.trim() !== expected}
              onClick={() => {
                setConfirming(false);
                onDelete();
              }}
            >
              Delete {count} file{count === 1 ? "" : "s"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
