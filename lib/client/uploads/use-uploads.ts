"use client";

import { useSyncExternalStore } from "react";
import { getUploadManager, type UploadManager } from "./manager";
import type { UploadSnapshot } from "./types";

const SERVER_SNAPSHOT: UploadSnapshot = {
  tasks: [], totalBytes: 0, sentBytes: 0, activeCount: 0, doneCount: 0, rate: 0,
};

/** Subscribe to upload queue state. */
export function useUploads(): UploadSnapshot {
  const manager = getUploadManager();
  return useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    // The manager is browser-only; SSR renders an empty queue.
    () => SERVER_SNAPSHOT
  );
}

export function useUploadManager(): UploadManager {
  return getUploadManager();
}
