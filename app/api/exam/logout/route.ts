import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { endExamSession } from "@/lib/exams/candidate-auth";

/** End an Exam ID + PIN session. A learner account session is not touched. */
export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    await endExamSession();
    return ok({ signedOut: true });
  } catch (e) {
    return handleError(e);
  }
}
