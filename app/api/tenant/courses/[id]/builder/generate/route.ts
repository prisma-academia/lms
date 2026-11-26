import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import {
  courseBuilderInputSchema,
  courseTemplateSchema,
  type CourseBuilderInput,
  type GeneratedCourse,
} from "@/lib/schemas/course-builder";
import {
  sseDataLine,
  SSE_HEARTBEAT,
  type CourseBuilderProgressEvent,
  type CourseBuilderWarningEvent,
} from "@/lib/schemas/course-builder-progress";
import { requireAiConfigured } from "@/lib/ai/http";
import { reviveAiError } from "@/lib/ai/run";
import { logger } from "@/lib/logger";

// One model call per lesson, several at a time; a full course takes minutes.
// The run's own time limits are measured against this number — when it stops
// starting calls, and how long a late call may run: lib/ai/course-builder-run.ts.
// `npm run verify:ai` fails if the two stop agreeing.
export const maxDuration = 300;

/** Comfortably inside the idle timeout of the proxies this stream passes through. */
const HEARTBEAT_MS = 15_000;

function progressEvent(
  partial: Omit<Extract<CourseBuilderProgressEvent, { type: "progress" }>, "type">
): CourseBuilderProgressEvent {
  return { type: "progress", ...partial };
}

/**
 * An import that already matches the course template is assembled without any
 * model call, so it must keep working when AI is not configured.
 */
function isTemplateImport(body: CourseBuilderInput): boolean {
  if (body.mode !== "adapt-json" || !body.sourceJson) return false;
  try {
    return courseTemplateSchema.safeParse(JSON.parse(body.sourceJson)).success;
  } catch {
    return false;
  }
}

function titleOf(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const title = (output as { title?: unknown }).title;
  return typeof title === "string" && title.trim() ? title : null;
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id: courseId } = await ctx.params;
    const body = courseBuilderInputSchema.parse(await request.json());

    const course = await prisma.course.findFirst({
      where: { id: courseId, tenantId: actor.tenantId },
    });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    // Say "AI is not set up" now, as a normal error response, rather than after
    // the progress dialog has opened and the first model call has failed.
    if (!isTemplateImport(body)) requireAiConfigured();

    // Lazy import keeps the Mastra instance (top-level await, native storage deps)
    // out of the module graph until the builder is actually used.
    const { getMastra } = await import("@/src/mastra");
    const mastra = await getMastra();
    const workflow = mastra.getWorkflow("courseBuilderWorkflow");
    const run = await workflow.createRun();

    const encoder = new TextEncoder();
    let clientStreamClosed = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const write = (text: string) => {
          if (clientStreamClosed) return;
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            clientStreamClosed = true;
          }
        };
        const send = (event: CourseBuilderProgressEvent) => write(sseDataLine(event));

        // A single lesson can take a minute with nothing to report. Without
        // traffic an intermediary may decide the connection is dead and close it.
        const heartbeat = setInterval(() => write(SSE_HEARTBEAT), HEARTBEAT_MS);

        // Lessons are ~85% of the wait; quizzes most of the rest.
        let lessonTotal = 0;

        try {
          send(progressEvent({ percent: 2, phase: "outline", label: "Designing the outline…" }));

          const workflowStream = run.stream({ inputData: body });

          for await (const chunk of workflowStream.fullStream) {
            if (clientStreamClosed) break;

            switch (chunk.type) {
              case "workflow-step-start": {
                const id = chunk.payload?.id;
                if (id === "write-lesson") {
                  send(progressEvent({ percent: 12, phase: "lessons", label: "Writing lessons…" }));
                } else if (id === "write-quiz") {
                  send(progressEvent({ percent: 85, phase: "quizzes", label: "Writing quizzes…" }));
                } else if (id === "assemble-course") {
                  send(progressEvent({ percent: 97, phase: "assemble", label: "Assembling the course…" }));
                }
                break;
              }
              case "workflow-step-result": {
                if (chunk.payload?.id === "generate-outline" && chunk.payload?.status === "success") {
                  send(
                    progressEvent({ percent: 10, phase: "outline", label: "Outline ready — writing lessons…" })
                  );
                }
                // A failed step is reported once, below, with its real cause.
                break;
              }
              case "workflow-step-progress": {
                const { id, completedCount, totalCount, iterationOutput } = chunk.payload;
                const title = titleOf(iterationOutput);
                const failed =
                  !!iterationOutput &&
                  typeof iterationOutput === "object" &&
                  (iterationOutput as { ok?: unknown }).ok === false;

                if (id === "write-lesson") {
                  lessonTotal = totalCount;
                  const percent =
                    totalCount > 0 ? Math.round(12 + (72 * completedCount) / totalCount) : 12;
                  send(
                    progressEvent({
                      percent: Math.min(84, percent),
                      phase: "lessons",
                      label: title
                        ? `${failed ? "Could not write" : "Wrote"} lesson ${completedCount} of ${totalCount}: ${title}`
                        : `Lesson ${completedCount} of ${totalCount}`,
                      completed: completedCount,
                      total: totalCount,
                    })
                  );
                } else if (id === "write-quiz") {
                  const percent =
                    totalCount > 0 ? Math.round(85 + (11 * completedCount) / totalCount) : 85;
                  send(
                    progressEvent({
                      percent: Math.min(96, percent),
                      phase: "quizzes",
                      label: title
                        ? `${failed ? "Could not write" : "Wrote"} quiz ${completedCount} of ${totalCount}: ${title}`
                        : `Quiz ${completedCount} of ${totalCount}`,
                      completed: completedCount,
                      total: totalCount,
                    })
                  );
                }
                break;
              }
              default:
                break;
            }
          }

          const result = await workflowStream.result;

          if (result.status !== "success") {
            // `result.error` is a plain object, not an Error — see reviveAiError.
            const error = reviveAiError(
              result.status === "failed"
                ? result.error
                : `Workflow ended with status "${result.status}".`
            );
            logger.error(
              { courseId, code: error.code, detail: error.detail, lessonTotal },
              "course_builder_failed"
            );
            send({ type: "error", code: error.code, message: error.userMessage });
            return;
          }

          const output = result.result as {
            course: GeneratedCourse;
            warnings?: CourseBuilderWarningEvent[];
          };
          send(progressEvent({ percent: 100, phase: "done", label: "Course ready" }));
          send({ type: "done", course: output.course, warnings: output.warnings ?? [] });
        } catch (e) {
          const error = reviveAiError(e);
          logger.error({ err: e, courseId, code: error.code }, "course_builder_crashed");
          send({ type: "error", code: error.code, message: error.userMessage });
        } finally {
          clearInterval(heartbeat);
          if (!clientStreamClosed) {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        }
      },
      cancel() {
        clientStreamClosed = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Tell nginx-style proxies not to buffer the stream into one late lump.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
