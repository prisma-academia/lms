/** Shared types for the resumable upload manager. */

/**
 * File System Access permission methods. Chromium-only and absent from the
 * standard TS DOM lib, so they are declared here as optional — every call site
 * must handle them being undefined (Safari and Firefox).
 */
declare global {
  interface FileSystemHandle {
    queryPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
    requestPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  }
  interface Window {
    showOpenFilePicker?: (options?: {
      multiple?: boolean;
      types?: { description?: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle[]>;
  }
  interface DataTransferItem {
    getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
  }
}

export type PartStatus = "pending" | "active" | "done" | "error";

export type PartState = {
  n: number;
  size: number;
  /** Bytes sent so far for the in-flight attempt; reset on retry. */
  sent: number;
  etag?: string;
  status: PartStatus;
  attempt: number;
};

export type TaskStatus =
  | "queued"
  | "creating"
  | "uploading"
  | "paused"
  | "error"
  | "completing"
  | "done"
  | "aborted"
  /** Session exists server-side but the File is gone (page was reloaded). */
  | "needs-file";

export type UploadMeta = {
  name: string;
  title?: string;
  description?: string;
  folderId: string | null;
  tagIds: string[];
  isPublic: boolean;
  isFree: boolean;
  priceCents: number | null;
  currency: string | null;
};

/** Identity of the picked file, used to validate a re-picked file on resume. */
export type FileFingerprint = {
  name: string;
  size: number;
  lastModified: number;
  type: string;
};

export type UploadTask = {
  /** Stable client id, survives reload. */
  id: string;
  /** Server session id; null until create resolves. */
  sessionId: string | null;
  key: string | null;
  file: File | null;
  fingerprint: FileFingerprint;
  partSize: number;
  parts: PartState[];
  status: TaskStatus;
  error?: { message: string; retryable: boolean };
  meta: UploadMeta;
  /** Item id once the upload has been committed. */
  itemId?: string;
  createdAt: number;
  /** Bytes/second, smoothed. */
  rate: number;
};

/** What is persisted to IndexedDB. The File itself cannot be serialized. */
export type PersistedSession = {
  id: string;
  sessionId: string | null;
  key: string | null;
  fingerprint: FileFingerprint;
  partSize: number;
  totalParts: number;
  completedParts: { n: number; etag: string; size: number }[];
  meta: UploadMeta;
  /**
   * Chromium only. FileSystemFileHandle is structured-cloneable, so with the
   * user's permission the same file can be reattached after a reload without
   * a second file picker. Absent on Safari and Firefox.
   */
  handle?: FileSystemFileHandle;
  createdAt: number;
  updatedAt: number;
};

export type UploadSnapshot = {
  tasks: UploadTask[];
  totalBytes: number;
  sentBytes: number;
  activeCount: number;
  doneCount: number;
  rate: number;
};
