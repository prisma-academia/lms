import type { SelectOption } from "@/lib/geo/options";

export type LessonContentType = "TEXT" | "HTML" | "VIDEO_URL" | "FILE" | "QUIZ";

export type LessonRow = {
  id: string;
  title: string;
  sortOrder: number;
  contentType: LessonContentType;
  contentJson: Record<string, unknown>;
  assetKey: string | null;
  durationMin: number | null;
  groupId: string | null;
};

export type LessonGroupRow = {
  id: string;
  title: string;
  parentId: string | null;
  sortOrder: number;
};

export type CourseInitial = {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: string;
  visibility: string;
  priceCents: number | null;
  currency: string;
  enrollmentCount: number;
  publishedAt: string | null;
  lessons: LessonRow[];
  lessonGroups: LessonGroupRow[];
};

export type CourseAnalytics = {
  totalEnrollments: number;
  completions: number;
  /** Average enrollment progress, 0-100 (rounded). */
  avgProgress: number;
  newLast30Days: number;
  /** Completion counts per lesson (lessons with zero completions may be absent). */
  lessonStats: { lessonId: string; completions: number }[];
  /** Weekly enrollment counts over the last ~90 days, oldest first. */
  weeklyEnrollments: { weekStart: string; count: number }[];
};

export type CourseEnrollmentRow = {
  id: string;
  clientId: string;
  clientEmail: string;
  clientName: string;
  enrolledAt: string;
  completedAt: string | null;
  progressPercent: number;
};

export type ClientOption = { id: string; email: string; name: string };

export type CourseEditorProps = {
  initial: CourseInitial;
  canWrite: boolean;
  quizzes: { id: string; title: string }[];
  libraryItems: { id: string; name: string; key: string }[];
  currencyOptions: SelectOption[];
  analytics: CourseAnalytics;
  /** Null when the actor lacks the enrollments read permission — hides the tab. */
  enrollments: CourseEnrollmentRow[] | null;
  clients: ClientOption[];
  canManageEnrollments: boolean;
};

export const CONTENT_TYPE_OPTIONS = [
  { value: "TEXT", label: "Text" },
  { value: "HTML", label: "HTML" },
  { value: "VIDEO_URL", label: "Video URL" },
  { value: "FILE", label: "File asset key" },
  { value: "QUIZ", label: "Quiz" },
];

export function bodyFieldLabel(type: LessonContentType): string {
  if (type === "TEXT") return "Body";
  if (type === "HTML") return "HTML source";
  if (type === "VIDEO_URL") return "Video URL";
  if (type === "FILE") return "Asset key";
  return "Quiz";
}

/* ---- AI builder config controls ----------------------------------------
   The builder API keeps free-string `audience` / `structureHints` fields
   (they are interpolated straight into the LLM prompt), so the structured
   controls below serialize into well-formed English strings. */

export const AUDIENCE_PRESETS = [
  { value: "beginners", label: "Beginners", text: "Beginners with no prior experience" },
  { value: "intermediate", label: "Intermediate", text: "Intermediate learners with some prior experience" },
  { value: "advanced", label: "Advanced", text: "Advanced learners looking to deepen expertise" },
  { value: "mixed", label: "Mixed levels", text: "A mixed-level audience — cover fundamentals briefly, then go deeper" },
  { value: "professionals", label: "Working professionals", text: "Working professionals applying this on the job" },
  { value: "custom", label: "Custom…", text: "" },
];

export function serializeAudience(preset: string, custom: string): string | null {
  if (!preset) return null;
  if (preset === "custom") return custom.trim() || null;
  return AUDIENCE_PRESETS.find((p) => p.value === preset)?.text ?? null;
}

export const QUIZ_MODE_OPTIONS = [
  { value: "", label: "No preference" },
  { value: "none", label: "No quizzes" },
  { value: "module", label: "Quiz after every module" },
  { value: "final", label: "One final quiz" },
];

export function serializeStructureHints(opts: {
  modules: string;
  lessonsPerModule: string;
  quizMode: string;
  extra: string;
}): string | null {
  const parts: string[] = [];
  if (opts.modules) parts.push(`${opts.modules} modules`);
  if (opts.lessonsPerModule) parts.push(`about ${opts.lessonsPerModule} lessons per module`);
  if (opts.quizMode === "none") parts.push("no quizzes");
  if (opts.quizMode === "module") parts.push("include a quiz at the end of every module");
  if (opts.quizMode === "final") parts.push("include a single final quiz at the end of the course");
  if (opts.extra.trim()) parts.push(opts.extra.trim());
  return parts.length ? parts.join("; ") : null;
}

export function getLessonBody(lesson: LessonRow): string {
  if (lesson.contentType === "VIDEO_URL") {
    return typeof lesson.contentJson.url === "string" ? lesson.contentJson.url : "";
  }
  if (lesson.contentType === "TEXT") {
    return typeof lesson.contentJson.body === "string" ? lesson.contentJson.body : "";
  }
  if (lesson.contentType === "HTML") {
    return typeof lesson.contentJson.html === "string" ? lesson.contentJson.html : "";
  }
  if (lesson.contentType === "QUIZ") return "";
  return lesson.assetKey ?? "";
}
