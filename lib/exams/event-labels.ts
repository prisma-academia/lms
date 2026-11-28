/**
 * Human-readable names for exam integrity events and attempt states. Pure and
 * client-safe: the invigilation room, the attempt review and the results page
 * all read them from here so an event is called the same thing everywhere.
 */

export const EVENT_LABEL: Record<string, string> = {
  STARTED: "Started the exam",
  RESUMED: "Reopened the exam",
  SUBMITTED: "Submitted",
  FULLSCREEN_ENTER: "Entered full screen",
  FULLSCREEN_EXIT: "Left full screen",
  TAB_HIDDEN: "Switched tab or app",
  WINDOW_BLUR: "Exam window lost focus",
  RETURNED: "Came back to the exam",
  COPY: "Tried to copy",
  CUT: "Tried to cut",
  PASTE: "Tried to paste",
  CONTEXT_MENU: "Opened the right-click menu",
  KEY_BLOCKED: "Pressed a blocked shortcut",
  PRINT_ATTEMPT: "Tried to print",
  MULTI_SCREEN: "Second screen detected",
  DEVTOOLS_SUSPECTED: "Developer tools suspected",
  AWAY_TIMEOUT: "Away from the exam too long",
  DEVICE_MISMATCH: "Opened on another device",
  IP_CHANGED: "Network address changed",
  SEB_MISSING: "Safe Exam Browser not detected",
  OFFLINE: "Went offline",
  ONLINE: "Back online",
  PROCTOR_EXTEND: "Invigilator gave extra time",
  PROCTOR_PAUSE: "Invigilator paused the attempt",
  PROCTOR_RESUME: "Invigilator resumed the attempt",
  PROCTOR_UNLOCK: "Invigilator unlocked the attempt",
  PROCTOR_RESET_DEVICE: "Invigilator allowed a new device",
  PROCTOR_TERMINATE: "Invigilator ended the attempt",
  PROCTOR_SITTING_RESUME: "Sitting resumed after a pause",
};

export function eventLabel(type: string, detail?: unknown): string {
  const base = EVENT_LABEL[type] ?? type.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  const d = detail && typeof detail === "object" ? (detail as Record<string, unknown>) : null;
  if (type === "PROCTOR_EXTEND" && typeof d?.minutes === "number") return `${base} (+${d.minutes} min)`;
  if (type === "SUBMITTED" && typeof d?.reason === "string") return `${base} (${SUBMIT_REASON_LABEL[d.reason] ?? d.reason})`;
  return base;
}

export const SEVERITY_LABEL: Record<number, string> = { 0: "Info", 1: "Warning", 2: "Violation" };

export const SUBMIT_REASON_LABEL: Record<string, string> = {
  MANUAL: "by the candidate",
  TIME_UP: "time ran out",
  MAX_VIOLATIONS: "too many violations",
  PROCTOR: "by the invigilator",
  WINDOW_CLOSED: "the exam window closed",
};

export const ATTEMPT_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  PAUSED: "Paused",
  LOCKED: "Locked",
  SUBMITTED: "Submitted",
  TERMINATED: "Terminated",
};

/** Theme tokens for attempt states. Always shown with a text label too. */
export const ATTEMPT_STATUS_COLOR: Record<string, string> = {
  NOT_STARTED: "var(--muted)",
  IN_PROGRESS: "var(--info)",
  PAUSED: "var(--warning)",
  LOCKED: "var(--destructive)",
  SUBMITTED: "var(--success)",
  TERMINATED: "var(--secondary)",
};

export const SEVERITY_COLOR: Record<number, string> = {
  0: "var(--muted)",
  1: "var(--warning)",
  2: "var(--destructive)",
};
