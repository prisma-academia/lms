import type { GeneratedCourse } from "@/lib/schemas/course-builder";

/** Something the author should know was left out or left empty. */
export type CourseBuilderWarningEvent = {
  kind: "lesson" | "quiz";
  module: string;
  title: string;
  reason: string;
};

/** Client-facing events from the course-builder generate SSE stream. */
export type CourseBuilderProgressEvent =
  | {
      type: "progress";
      percent: number;
      phase: "outline" | "lessons" | "quizzes" | "assemble" | "done";
      label: string;
      completed?: number;
      total?: number;
    }
  | {
      type: "error";
      message: string;
      /** Machine-readable cause (`not_configured`, `credits`, `timeout`, …). */
      code?: string;
    }
  | {
      type: "done";
      course: GeneratedCourse;
      /** Lessons left empty and quizzes left out. Empty when everything was written. */
      warnings?: CourseBuilderWarningEvent[];
    };

export function sseDataLine(event: CourseBuilderProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * An SSE comment line. Clients ignore it; proxies and load balancers do not —
 * it is traffic, and traffic is what keeps an idle-timeout from closing a
 * stream while a slow model call is still running.
 */
export const SSE_HEARTBEAT = ": keep-alive\n\n";
