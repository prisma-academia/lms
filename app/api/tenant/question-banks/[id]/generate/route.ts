import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { enforceRateLimit, type RateLimitPreset } from "@/lib/auth/rate-limit";
import { aiDomainError, requireAiConfigured } from "@/lib/ai/http";
import { GENERATABLE_TYPES, generateQuestions } from "@/lib/ai/question-generator";
import { lessonPlainText } from "@/lib/courses/lesson-text";
import { questionColumns } from "@/lib/assessments/question-io";
import { essayRubricSchema } from "@/lib/schemas/essay-grading";

/**
 * AI question generator. Writes questions and returns them for the author to
 * review; nothing is stored here. Accepted questions are saved through the
 * import route (format "json").
 */

export const maxDuration = 180;

const PER_USER: RateLimitPreset = { name: "question-generate", limit: 15, windowSeconds: 10 * 60 };
const AUDIT_ACTION = "question_bank.ai_generate";
const MAX_PER_HOUR = 40;
const MAX_PER_DAY = 200;

const Body = z
  .object({
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("topic"), topic: z.string().min(3).max(2000) }),
      z.object({ kind: z.literal("text"), text: z.string().min(50).max(60_000), label: z.string().max(200).optional() }),
      z.object({ kind: z.literal("lesson"), lessonId: z.string().min(1) }),
    ]),
    count: z.number().int().min(1).max(30),
    types: z.array(z.enum(GENERATABLE_TYPES)).min(1).max(GENERATABLE_TYPES.length),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD", "MIXED"]).default("MIXED"),
    level: z.string().max(60).nullable().optional(),
    audience: z.string().max(200).nullable().optional(),
    instructions: z.string().max(1000).nullable().optional(),
  })
  .strict();

async function enforceBudget(tenantId: string) {
  const now = Date.now();
  const [hour, day] = await Promise.all([
    prisma.activityLog.count({ where: { tenantId, action: AUDIT_ACTION, createdAt: { gte: new Date(now - 3_600_000) } } }),
    prisma.activityLog.count({ where: { tenantId, action: AUDIT_ACTION, createdAt: { gte: new Date(now - 86_400_000) } } }),
  ]);
  if (hour >= MAX_PER_HOUR) throw new DomainError(429, "ai_budget", "Your academy has generated a lot of questions this hour. Try again shortly.");
  if (day >= MAX_PER_DAY) throw new DomainError(429, "ai_budget", "Your academy has reached today's limit for AI question writing.");
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id: bankId } = await ctx.params;
    const body = Body.parse(await request.json());

    const bank = await prisma.questionBank.findFirst({ where: { id: bankId, tenantId: actor.tenantId }, select: { id: true, name: true } });
    if (!bank) throw new DomainError(404, "not_found", "Question bank not found.");

    let topic: string | null = null;
    let sourceText: string | null = null;
    let sourceLabel: string | null = null;
    if (body.source.kind === "topic") topic = body.source.topic;
    else if (body.source.kind === "text") {
      sourceText = body.source.text;
      sourceLabel = body.source.label ?? null;
    } else {
      const lesson = await prisma.lesson.findFirst({
        where: { id: body.source.lessonId, tenantId: actor.tenantId },
        select: { title: true, contentJson: true },
      });
      if (!lesson) throw new DomainError(404, "lesson_not_found", "That lesson was not found.");
      sourceText = lessonPlainText(lesson.contentJson);
      sourceLabel = `lesson "${lesson.title}"`;
      if (sourceText.length < 50) throw new DomainError(400, "lesson_empty", "That lesson has too little text to write questions from.");
    }

    requireAiConfigured();
    await enforceRateLimit(PER_USER, [actor.userId]);
    await enforceBudget(actor.tenantId);
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: AUDIT_ACTION,
      tenantId: actor.tenantId,
      targetType: "QuestionBank",
      targetId: bankId,
      after: { source: body.source.kind, count: body.count, types: body.types },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const { getMastra } = await import("@/src/mastra");
    let generated;
    try {
      const mastra = await getMastra();
      generated = await generateQuestions(mastra.getAgent("questionWriterAgent"), {
        topic,
        sourceText,
        sourceLabel,
        count: body.count,
        types: body.types,
        difficulty: body.difficulty,
        level: body.level ?? null,
        audience: body.audience ?? null,
        instructions: body.instructions ?? null,
      });
    } catch (e) {
      throw aiDomainError(e, "question_generate");
    }

    // Only questions the registry accepts are offered; the rest are counted.
    let rejected = 0;
    const questions = generated.filter((q) => {
      try {
        questionColumns({
          type: q.type,
          prompt: q.prompt,
          options: q.options,
          answer: q.answer,
          rubric: q.type === "ESSAY" ? essayRubricSchema.parse(q.rubric) : null,
        });
        return true;
      } catch (e) {
        if (e instanceof DomainError || e instanceof z.ZodError) {
          rejected++;
          return false;
        }
        throw e;
      }
    });
    return ok({ questions, rejected });
  } catch (e) {
    return handleError(e);
  }
}
