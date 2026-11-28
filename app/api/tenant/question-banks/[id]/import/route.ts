import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { parseImport, type ParseIssue } from "@/lib/assessments/import-formats";
import { promptHashOf, questionColumns } from "@/lib/assessments/question-io";
import { essayRubricSchema } from "@/lib/schemas/essay-grading";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Import questions into a bank from Aiken, GIFT, CSV or JSON (also used to
 * save questions the AI generator wrote).
 *
 * `dryRun: true` (the default) parses and validates everything and stores
 * nothing, so the author sees exactly what would happen first.
 */

const Body = z.object({
  format: z.enum(["aiken", "gift", "csv", "json"]),
  text: z.string().min(1).max(2_000_000),
  dryRun: z.boolean().default(true),
  /** Skip questions whose prompt already exists in this bank. */
  skipDuplicates: z.boolean().default(true),
});

const MAX_QUESTIONS = 1000;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const { id: bankId } = await ctx.params;
    const body = Body.parse(await request.json());

    const bank = await prisma.questionBank.findFirst({ where: { id: bankId, tenantId: actor.tenantId }, select: { id: true, name: true } });
    if (!bank) throw new DomainError(404, "not_found", "Question bank not found.");

    const parsed = parseImport(body.format, body.text);
    if (parsed.questions.length > MAX_QUESTIONS) {
      throw new DomainError(400, "too_many", `At most ${MAX_QUESTIONS} questions per import. Split the file.`);
    }
    const issues: ParseIssue[] = [...parsed.issues];
    const existing = new Set(
      (await prisma.question.findMany({ where: { bankId }, select: { promptHash: true } }))
        .map((q) => q.promptHash)
        .filter((h): h is string => !!h)
    );

    type Ready = { columns: ReturnType<typeof questionColumns>; src: (typeof parsed.questions)[number] };
    const ready: Ready[] = [];
    let duplicates = 0;
    const seen = new Set<string>();
    parsed.questions.forEach((q, n) => {
      try {
        const rubric = q.type === "ESSAY" ? essayRubricSchema.parse(q.rubric) : null;
        const columns = questionColumns({ type: q.type, prompt: q.prompt.trim(), options: q.options, answer: q.answer, rubric });
        const hash = promptHashOf(q.prompt);
        if (existing.has(hash) || seen.has(hash)) {
          duplicates++;
          if (body.skipDuplicates) return;
        }
        seen.add(hash);
        ready.push({ columns, src: q });
      } catch (e) {
        issues.push({
          item: n + 1,
          line: q.sourceLine,
          message: e instanceof DomainError ? e.message : e instanceof z.ZodError ? "The essay rubric is not valid." : "Could not read this question.",
        });
      }
    });

    const preview = ready.slice(0, 200).map((r) => ({
      type: r.columns.type,
      prompt: r.columns.prompt,
      options: r.columns.optionsJson,
      answer: r.columns.answerJson,
      points: r.src.points ?? 1,
      difficulty: r.src.difficulty ?? null,
      tags: r.src.tags ?? [],
    }));

    if (body.dryRun) {
      return ok({ dryRun: true, ready: ready.length, duplicates, issues, preview });
    }
    if (ready.length === 0) throw new DomainError(400, "nothing_to_import", "There is nothing valid to import.");

    // Tags by name: reuse existing, create missing.
    const tagNames = [...new Set(ready.flatMap((r) => (r.src.tags ?? []).map((t) => t.trim()).filter(Boolean)))].slice(0, 200);
    const tagIdByName = new Map<string, string>();
    if (tagNames.length) {
      const found = await prisma.questionTag.findMany({ where: { name: { in: tagNames } }, select: { id: true, name: true } });
      found.forEach((t) => tagIdByName.set(t.name, t.id));
      for (const name of tagNames.filter((n) => !tagIdByName.has(n))) {
        const t = await prisma.questionTag.create({ data: { tenantId: actor.tenantId, name: name.slice(0, 60) } });
        tagIdByName.set(name, t.id);
      }
    }

    const created = await prisma.$transaction(
      ready.map((r) =>
        prisma.question.create({
          data: {
            tenantId: actor.tenantId,
            bankId,
            ...r.columns,
            rubricJson: r.columns.rubricJson ?? Prisma.DbNull,
            points: r.src.points ?? 1,
            difficulty: r.src.difficulty ?? null,
            explanation: r.src.explanation?.trim() || null,
            hint: r.src.hint?.trim() || null,
            partialCredit: r.src.partialCredit ?? false,
            negativePoints: r.src.negativePoints ?? null,
            tags: (r.src.tags ?? []).length
              ? {
                  create: [...new Set((r.src.tags ?? []).map((t) => tagIdByName.get(t.trim())).filter((x): x is string => !!x))].map(
                    (tagId) => ({ tenantId: actor.tenantId, tagId })
                  ),
                }
              : undefined,
          },
          select: { id: true },
        })
      )
    );

    await audit({
      tenantId: actor.tenantId,
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "question_bank.import",
      targetType: "QuestionBank",
      targetId: bankId,
      after: { format: body.format, imported: created.length, duplicates, issues: issues.length },
      ...requestMeta(request),
    });

    return ok({ dryRun: false, imported: created.length, duplicates, issues });
  } catch (e) {
    return handleError(e);
  }
}
