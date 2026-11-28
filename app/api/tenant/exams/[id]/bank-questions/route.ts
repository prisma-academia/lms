import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { DomainError, handleError } from "@/lib/api/errors";
import { canAccessBank } from "@/lib/assessments/bank-access";
import { findExam } from "@/lib/exams/admin";
import { questionTypeSchema } from "@/lib/schemas/question";

const Query = z.object({
  bankId: z.string().min(1),
  q: z.string().max(200).optional(),
  type: questionTypeSchema.optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "none"]).optional(),
  tagId: z.string().min(1).optional(),
});

/** The question picker: one bank's questions, filtered, with where each is already used in this exam. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_READ.key);
    const { id } = await ctx.params;
    await findExam(actor.tenantId, id);
    const params = Object.fromEntries(
      [...new URL(request.url).searchParams.entries()].filter(([, v]) => v.trim() !== "")
    );
    const query = Query.parse(params);
    if (!(await canAccessBank(actor, query.bankId))) {
      throw new DomainError(404, "not_found", "Question bank not found.");
    }
    const q = query.q?.trim();
    const rows = await prisma.question.findMany({
      where: {
        tenantId: actor.tenantId,
        bankId: query.bankId,
        ...(q ? { prompt: { contains: q, mode: "insensitive" as const } } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.difficulty === "none" ? { difficulty: null } : query.difficulty ? { difficulty: query.difficulty } : {}),
        ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 301,
      select: {
        id: true,
        type: true,
        prompt: true,
        points: true,
        difficulty: true,
        groupId: true,
        tags: { select: { tag: { select: { id: true, name: true } } } },
      },
    });
    const used = await prisma.examSectionItem.findMany({
      where: { section: { examId: id }, questionId: { in: rows.map((r) => r.id) } },
      select: { questionId: true, sectionId: true },
    });
    const usedIn = new Map(used.map((u) => [u.questionId, u.sectionId]));
    return ok({
      truncated: rows.length > 300,
      questions: rows.slice(0, 300).map((r) => ({
        id: r.id,
        type: r.type,
        prompt: r.prompt,
        points: r.points,
        difficulty: r.difficulty,
        inPassage: !!r.groupId,
        tags: r.tags.map((t) => t.tag),
        usedInSectionId: usedIn.get(r.id) ?? null,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
