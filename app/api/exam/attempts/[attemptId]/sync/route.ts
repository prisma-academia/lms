import { prisma } from "@/lib/db/client";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { ownsCandidate, requireCandidateIdentity } from "@/lib/exams/candidate-auth";
import { applySync, syncSchema } from "@/lib/exams/attempts";
import { parseSecurity } from "@/lib/exams/settings";
import { publicUrlOf, verifySeb } from "@/lib/exams/seb";

/**
 * The exam window's heartbeat. Sends answers saved on the device (newer
 * revisions only win), integrity events, and — at the end — the submit.
 * Answers back: the server clock, the deadline (after any extension or pause),
 * status, strikes and invigilator messages.
 */
export const maxDuration = 60;

export async function POST(request: Request, ctx: { params: Promise<{ attemptId: string }> }) {
  try {
    await requireCsrf(request);
    const identity = await requireCandidateIdentity();
    const { attemptId } = await ctx.params;
    const body = syncSchema.parse(await request.json());

    const attempt = await prisma.examAttempt.findFirst({
      where: { id: attemptId, tenantId: identity.tenantId },
      select: { id: true, candidate: { select: { id: true, clientId: true, examId: true } }, exam: { select: { securityJson: true } } },
    });
    if (!attempt || !ownsCandidate(identity, attempt.candidate)) throw new DomainError(404, "not_found", "Attempt not found.");
    const seb = verifySeb(request.headers, publicUrlOf(request), parseSecurity(attempt.exam.securityJson));
    if (!seb.ok) throw new DomainError(403, "seb_required", "This exam must be taken in Safe Exam Browser.");

    return ok(await applySync(attempt.id, body));
  } catch (e) {
    return handleError(e);
  }
}
