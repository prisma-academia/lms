import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { courseBuilderInputSchema, generatedCourseSchema } from "@/lib/schemas/course-builder";
import {
  sseDataLine,
  SSE_HEARTBEAT,
  type CourseBuilderProgressEvent,
} from "@/lib/schemas/course-builder-progress";
import { aiDomainError, requireAiConfigured } from "@/lib/ai/http";
import { aiUserMessage, type AiErrorCode } from "@/lib/ai/run";
import { builderDeadline } from "@/lib/ai/course-builder-run";
import { writeMissingQuizzes } from "@/lib/courses/missing-quizzes";
import { logger } from "@/lib/logger";

/**
 * "Generate the missing quizzes".
 *
 * A course-builder run that used its whole time allowance on lessons leaves its
 * quizzes out and says so. This writes only those: the draft comes in, the
 * same draft goes back with the quiz lessons added (lib/courses/missing-quizzes.ts).
 *
 * Nothing is saved here. The author reviews the draft and adds it to the course
 * through `builder/apply`, exactly as before — which is also where a question's
 * "where this was taught" becomes a link to a real lesson.
 *
 * It speaks the generate route's event stream (progress…, then `done` with the
 * course and whatever is still missing, or `error`), so the builder shows it in
 * the same progress dialog.
 */

// Up to three quiz calls at a time, each allowed two minutes. The time limits
// inside the run are measured against this number: lib/ai/course-builder-run.ts.
export const maxDuration = 300;

/** Comfortably inside the idle timeout of the proxies this stream passes through. */
const HEARTBEAT_MS = 15_000;

const Body = z.object({
  /** The draft as it stands in the builder, edits included. */
  course: generatedCourseSchema,
  /** The quizzes the run reported as left out. */
  missing: z
    .array(z.object({ module: z.string().min(1).max(200), title: z.string().min(1).max(200) }))
    .min(1)
    .max(30),
  /** What the draft was generated from: topic, audience, hints, essays, pass mark. */
  request: courseBuilderInputSchema,
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id: courseId } = await ctx.params;
    const body = Body.parse(await request.json());

    const course = await prisma.course.findFirst({
      where: { id: courseId, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    // "AI is not set up" is an ordinary error response, not a failed dialog.
    requireAiConfigured();

    let agent;
    try {
      // Lazy import keeps the Mastra instance (top-level await, native storage
      // deps) out of the module graph until it is actually used.
      const { getMastra } = await import("@/src/mastra");
      agent = (await getMastra()).getAgent("courseBuilderAgent");
    } catch (e) {
      throw aiDomainError(e, "builder_missing_quizzes");
    }

    const deadlineAt = builderDeadline();
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
        const heartbeat = setInterval(() => write(SSE_HEARTBEAT), HEARTBEAT_MS);

        try {
          const total = body.missing.length;
          send({
            type: "progress",
            percent: 4,
            phase: "quizzes",
            label: total === 1 ? "Writing the quiz…" : `Writing ${total} quizzes…`,
            completed: 0,
            total,
          });

          const result = await writeMissingQuizzes(agent, {
            course: body.course,
            missing: body.missing,
            request: body.request,
            deadlineAt,
            onProgress: ({ completed, total: of, title, ok }) =>
              send({
                type: "progress",
                percent: Math.min(96, Math.round(4 + (92 * completed) / of)),
                phase: "quizzes",
                label: `${ok ? "Wrote" : "Could not write"} quiz ${completed} of ${of}: ${title}`,
                completed,
                total: of,
              }),
          });

          if (result.written === 0 && result.warnings.length > 0) {
            // Nothing came of it, and one cause (no credit, provider down, out
            // of time) almost certainly explains every failure. Say that,
            // rather than hand back the draft unchanged as if it had worked.
            const code = (result.firstErrorCode ?? "unknown") as AiErrorCode;
            logger.error(
              { courseId, code, wanted: total, reasons: result.warnings.map((w) => w.reason) },
              "builder_missing_quizzes_failed"
            );
            const reasons = new Set(result.warnings.map((w) => w.reason));
            send({
              type: "error",
              code,
              message: reasons.size === 1 ? result.warnings[0].reason : aiUserMessage(code),
            });
            return;
          }

          send({ type: "progress", percent: 100, phase: "done", label: "Quizzes ready" });
          send({ type: "done", course: result.course, warnings: result.warnings });
        } catch (e) {
          const error = aiDomainError(e, "builder_missing_quizzes");
          send({ type: "error", code: error.code, message: error.message });
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
