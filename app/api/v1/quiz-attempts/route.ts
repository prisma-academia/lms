import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { QuizAttemptListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";

/** GET /api/v1/quiz-attempts — `updated_since` filters on the start time. */
export const GET = apiRoute({ scope: "results:read" }, async (ctx) => {
  const q = ctx.query(QuizAttemptListQuery);
  const rows = await prisma.quizAttempt.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...sinceFilter(q, "startedAt"),
      ...(q.quiz_id ? { quizId: q.quiz_id } : {}),
      ...(q.learner_id ? { clientId: q.learner_id } : {}),
    },
    select: { id: true, quizId: true, clientId: true, startedAt: true, submittedAt: true, scorePercent: true, passed: true, gradingStatus: true },
    ...pageArgs(q, "startedAt"),
  });
  return page(rows, q, out.quizAttempt);
});
