import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCandidateIdentity } from "@/lib/exams/candidate-auth";
import { candidateFor } from "@/lib/exams/access";
import { lobbyState } from "@/lib/exams/candidate-view";

/** The lobby: who you are, what the exam is, whether you can start. */
export async function GET(request: Request, ctx: { params: Promise<{ examId: string }> }) {
  try {
    const identity = await requireCandidateIdentity();
    const { examId } = await ctx.params;
    const code = new URL(request.url).searchParams.get("code");
    const { exam, candidate } = await candidateFor(examId, identity, { accessCode: code, create: true });
    if (!candidate) return ok({ needsCode: true });
    return ok(await lobbyState(exam, candidate));
  } catch (e) {
    return handleError(e);
  }
}
