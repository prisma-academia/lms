import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { handleError, DomainError } from "@/lib/api/errors";
import { canAccessBank } from "@/lib/assessments/bank-access";
import { toAiken, toCsv, toGift } from "@/lib/assessments/import-formats";
import { parseRubric } from "@/lib/schemas/essay-grading";

/** Download a bank as JSON (lossless), CSV, Aiken or GIFT. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_READ.key);
    const { id } = await ctx.params;
    if (!(await canAccessBank(actor, id))) throw new DomainError(404, "not_found", "Question bank not found.");
    const format = new URL(request.url).searchParams.get("format") ?? "json";

    const bank = await prisma.questionBank.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        questions: {
          orderBy: { createdAt: "asc" },
          include: { tags: { include: { tag: { select: { name: true } } } } },
        },
      },
    });
    if (!bank) throw new DomainError(404, "not_found", "Question bank not found.");

    const rows = bank.questions.map((q) => ({
      type: q.type,
      prompt: q.prompt,
      options: q.optionsJson,
      answer: q.answerJson,
      rubric: parseRubric(q.rubricJson),
      points: q.points,
      difficulty: q.difficulty,
      explanation: q.explanation,
      hint: q.hint,
      partialCredit: q.partialCredit,
      negativePoints: q.negativePoints,
      media: q.mediaJson,
      tags: q.tags.map((t) => t.tag.name),
    }));

    const safeName = bank.name.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-").slice(0, 60) || "question-bank";
    let body: string;
    let type: string;
    let ext: string;
    if (format === "csv") {
      body = toCsv(rows);
      type = "text/csv; charset=utf-8";
      ext = "csv";
    } else if (format === "aiken") {
      body = toAiken(rows);
      type = "text/plain; charset=utf-8";
      ext = "aiken.txt";
    } else if (format === "gift") {
      body = toGift(rows);
      type = "text/plain; charset=utf-8";
      ext = "gift.txt";
    } else {
      body = JSON.stringify({ bank: bank.name, exportedAt: new Date().toISOString(), questions: rows }, null, 2);
      type = "application/json; charset=utf-8";
      ext = "json";
    }
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="${safeName}.${ext}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
