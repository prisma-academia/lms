import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { courseBuilderInputSchema, type GeneratedCourse } from "@/lib/schemas/course-builder";
import {
  sseDataLine,
  type CourseBuilderProgressEvent,
} from "@/lib/schemas/course-builder-progress";

// Course generation calls an LLM per module and can take a couple of minutes.
export const maxDuration = 300;

function progressEvent(
  partial: Omit<Extract<CourseBuilderProgressEvent, { type: "progress" }>, "type">
): CourseBuilderProgressEvent {
  return { type: "progress", ...partial };
}

function moduleTitleFromOutput(output: Record<string, unknown> | undefined): string | null {
  if (!output || typeof output !== "object") return null;
  if (typeof output.title === "string" && output.title.trim()) return output.title;
  return null;
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

    // Lazy import keeps the Mastra instance (top-level await, native storage deps)
    // out of the module graph until the builder is actually used.
    const { mastra } = await import("@/src/mastra");
    const workflow = mastra.getWorkflow("courseBuilderWorkflow");
    const run = await workflow.createRun();

    const encoder = new TextEncoder();
    let clientStreamClosed = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: CourseBuilderProgressEvent) => {
          if (clientStreamClosed) return;
          try {
            controller.enqueue(encoder.encode(sseDataLine(event)));
          } catch {
            clientStreamClosed = true;
          }
        };

        try {
          send(
            progressEvent({
              percent: 2,
              phase: "outline",
              label: "Designing outline…",
            })
          );

          const workflowStream = run.stream({ inputData: body });

          for await (const chunk of workflowStream) {
            if (clientStreamClosed) break;

            switch (chunk.type) {
              case "workflow-step-start": {
                const id = chunk.payload?.id;
                if (id === "generate-outline") {
                  send(
                    progressEvent({
                      percent: 5,
                      phase: "outline",
                      label: "Designing outline…",
                    })
                  );
                } else if (id === "generate-module") {
                  send(
                    progressEvent({
                      percent: 15,
                      phase: "modules",
                      label: "Writing modules…",
                    })
                  );
                } else if (id === "assemble-course") {
                  send(
                    progressEvent({
                      percent: 96,
                      phase: "assemble",
                      label: "Assembling course…",
                    })
                  );
                }
                break;
              }
              case "workflow-step-output": {
                const payload = chunk.payload as Record<string, unknown>;
                const candidates = [payload, payload.output].filter(
                  (v): v is Record<string, unknown> => !!v && typeof v === "object"
                );
                for (const obj of candidates) {
                  if (obj.phase === "outline") {
                    send(
                      progressEvent({
                        percent: 8,
                        phase: "outline",
                        label: typeof obj.label === "string" ? obj.label : "Designing outline…",
                      })
                    );
                    break;
                  }
                }
                break;
              }
              case "workflow-step-result": {
                const id = chunk.payload?.id;
                const status = chunk.payload?.status;
                if (id === "generate-outline" && status === "success") {
                  send(
                    progressEvent({
                      percent: 15,
                      phase: "outline",
                      label: "Outline ready — writing lessons…",
                    })
                  );
                } else if (status === "failed") {
                  send({
                    type: "error",
                    message: `Course generation failed: step "${id ?? "unknown"}" failed.`,
                  });
                }
                break;
              }
              case "workflow-step-progress": {
                const { completedCount, totalCount, iterationStatus, iterationOutput, currentIndex } =
                  chunk.payload;
                if (iterationStatus === "failed") {
                  send({
                    type: "error",
                    message: `Course generation failed while writing module ${currentIndex + 1} of ${totalCount}.`,
                  });
                  break;
                }
                const title = moduleTitleFromOutput(
                  iterationOutput as Record<string, unknown> | undefined
                );
                const percent =
                  totalCount > 0
                    ? Math.min(95, Math.round(15 + (80 * completedCount) / totalCount))
                    : 15;
                send(
                  progressEvent({
                    percent,
                    phase: "modules",
                    label: title
                      ? `Wrote module ${completedCount} of ${totalCount}: ${title}`
                      : `Wrote module ${completedCount} of ${totalCount}`,
                    completed: completedCount,
                    total: totalCount,
                  })
                );
                break;
              }
              default:
                break;
            }
          }

          const result = await workflowStream.result;

          if (result.status !== "success") {
            const detail =
              result.status === "failed" && result.error instanceof Error
                ? result.error.message
                : `Workflow ended with status "${result.status}".`;
            send({ type: "error", message: `Course generation failed: ${detail}` });
            return;
          }

          const generated = (result.result as { course: GeneratedCourse }).course;
          send(
            progressEvent({
              percent: 100,
              phase: "done",
              label: "Course ready",
            })
          );
          send({ type: "done", course: generated });
        } catch (e) {
          const message =
            e instanceof Error ? e.message : "Course generation failed unexpectedly.";
          send({ type: "error", message: `Course generation failed: ${message}` });
        } finally {
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
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
