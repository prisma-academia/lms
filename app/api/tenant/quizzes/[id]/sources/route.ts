import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { loadQuizSources } from "@/lib/assessments/quiz-sources";

/** The lessons and headings this quiz's questions can point at for "read up". */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_READ.key);
    const { id: quizId } = await ctx.params;

    const quiz = await prisma.quiz.findFirst({
      where: { id: quizId, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (!quiz) throw new DomainError(404, "not_found", "Quiz not found.");

    return ok({ courses: await loadQuizSources(actor.tenantId, quizId) });
  } catch (e) {
    return handleError(e);
  }
}
