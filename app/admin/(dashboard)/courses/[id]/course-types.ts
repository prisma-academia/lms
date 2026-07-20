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

export type CourseEditorProps = {
  initial: CourseInitial;
  canWrite: boolean;
  quizzes: { id: string; title: string }[];
  libraryItems: { id: string; name: string; key: string }[];
  currencyOptions: SelectOption[];
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
