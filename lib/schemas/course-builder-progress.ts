import type { GeneratedCourse } from "@/lib/schemas/course-builder";

/** Client-facing events from the course-builder generate SSE stream. */
export type CourseBuilderProgressEvent =
  | {
      type: "progress";
      percent: number;
      phase: "outline" | "modules" | "assemble" | "done";
      label: string;
      completed?: number;
      total?: number;
    }
  | { type: "error"; message: string }
  | { type: "done"; course: GeneratedCourse };

export function sseDataLine(event: CourseBuilderProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
