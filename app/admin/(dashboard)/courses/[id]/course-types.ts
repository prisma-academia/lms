import type { SelectOption } from "@/lib/geo/options";
import { lessonTextToHtml } from "@/lib/courses/lesson-markdown";

export type LessonContentType = "TEXT" | "HTML" | "VIDEO_URL" | "FILE" | "QUIZ";

export type LessonRow = {
  id: string;
  title: string;
  sortOrder: number;
  contentType: LessonContentType;
  contentJson: Record<string, unknown>;
  assetKey: string | null;
  libraryItemId: string | null;
  durationMin: number | null;
  /**
   * Whether the learner must keep this lesson open for a computed minimum
   * before "Mark complete" unlocks. Optional because rows fetched by older
   * callers omit it; `undefined` reads as the schema default (true).
   */
  requireDwell?: boolean;
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
  /**
   * `publishedAt` as people read it, formatted on the server in the academy's
   * locale and time zone. Dates are never formatted in these Client Components:
   * the server and the browser disagree, and React reports the difference.
   */
  publishedLabel: string | null;
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
  weeklyEnrollments: {
    weekStart: string;
    /** "2 Nov 2026" — the week's first day, formatted on the server. */
    weekLabel: string;
    count: number;
  }[];
};

export type CourseEnrollmentRow = {
  id: string;
  clientId: string;
  clientEmail: string;
  clientName: string;
  /** ISO strings, kept for sorting. */
  enrolledAt: string;
  completedAt: string | null;
  /** The same moments as people read them, formatted on the server. */
  enrolledLabel: string;
  completedLabel: string | null;
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
  /** The tab named in the address (`?tab=content`), if any. */
  initialTab?: string;
};

/**
 * TEXT is deliberately absent as an authoring choice.
 *
 * TEXT and HTML were two options producing the same thing — a lesson body — and
 * differing only in whether the author's formatting survived. Now that both are
 * authored in the WYSIWYG, offering both would be asking an author to pick a
 * storage format. New and edited lessons save as HTML; existing TEXT rows keep
 * rendering, and open in the editor via `authoringContentType`.
 */
export const CONTENT_TYPE_OPTIONS = [
  { value: "HTML", label: "Text & rich content" },
  { value: "VIDEO_URL", label: "Video (YouTube, Vimeo, or file)" },
  { value: "FILE", label: "Library file" },
  { value: "QUIZ", label: "Quiz" },
];

/**
 * The type a lesson is *edited* as. A stored TEXT lesson is authored as HTML;
 * without this its select would sit on a value the option list no longer offers
 * and render blank.
 */
export function authoringContentType(type: LessonContentType | undefined): LessonContentType {
  return !type || type === "TEXT" ? "HTML" : type;
}

export function bodyFieldLabel(type: LessonContentType): string {
  if (type === "TEXT" || type === "HTML") return "Lesson content";
  if (type === "VIDEO_URL") return "Video link";
  if (type === "FILE") return "Library file";
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

/**
 * The inverse of `getLessonBody`: pack the single body field back into the
 * shape this content type stores. Lives here rather than in either editor
 * because both of them write lessons, and two copies of the mapping is two
 * chances for a content type to be saved under the wrong key.
 */
export function buildContentJson(type: LessonContentType, body: string, quizId: string) {
  return type === "TEXT"
    ? { body }
    : type === "HTML"
      ? { html: body }
      : type === "VIDEO_URL"
        ? { url: body.trim() }
        : type === "QUIZ"
          ? { quizId }
          : {};
}

export function getLessonBody(lesson: LessonRow): string {
  if (lesson.contentType === "VIDEO_URL") {
    return typeof lesson.contentJson.url === "string" ? lesson.contentJson.url : "";
  }
  if (lesson.contentType === "TEXT") {
    // Converted, not returned raw: the body is authored in the WYSIWYG now, so
    // handing it markdown source would show the author a literal `## Heading` —
    // exactly what the learner's renderer was fixed to stop doing.
    const body = typeof lesson.contentJson.body === "string" ? lesson.contentJson.body : "";
    return body ? lessonTextToHtml(body) : "";
  }
  if (lesson.contentType === "HTML") {
    return typeof lesson.contentJson.html === "string" ? lesson.contentJson.html : "";
  }
  if (lesson.contentType === "QUIZ") return "";
  return lesson.assetKey ?? "";
}
