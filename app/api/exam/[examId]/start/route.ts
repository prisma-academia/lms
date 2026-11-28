import { z } from "zod";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { clientIpOf, requireCandidateIdentity } from "@/lib/exams/candidate-auth";
import { candidateFor } from "@/lib/exams/access";
import { startOrResume } from "@/lib/exams/attempts";
import { windowPayload } from "@/lib/exams/candidate-view";
import { parseSecurity } from "@/lib/exams/settings";
import { publicUrlOf, verifySeb } from "@/lib/exams/seb";

/**
 * Start (or resume) the attempt and hand the exam window its whole package:
 * every question in candidate-safe form, the clock, and any answers already
 * saved on the server. The window stores it on the device, so the exam keeps
 * running if the network drops.
 */

const Body = z.object({
  deviceToken: z.string().min(8).max(100),
  accessCode: z.string().max(40).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ examId: string }> }) {
  try {
    await requireCsrf(request);
    const identity = await requireCandidateIdentity();
    const { examId } = await ctx.params;
    const body = Body.parse(await request.json());
    const { exam, candidate } = await candidateFor(examId, identity, { accessCode: body.accessCode, create: true });
    if (!candidate) throw new DomainError(403, "access_code_required", "Enter the access code your teacher gave you.");

    const security = parseSecurity(exam.securityJson);
    const seb = verifySeb(request.headers, publicUrlOf(request), security);
    if (!seb.ok) {
      throw new DomainError(
        403,
        "seb_required",
        seb.reason === "no_keys"
          ? "This exam needs Safe Exam Browser, but it is not set up yet. Tell the invigilator."
          : "This exam must be taken in Safe Exam Browser. Open it with the button on this page."
      );
    }

    const { attempt } = await startOrResume({
      examId: exam.id,
      candidateId: candidate.id,
      deviceToken: body.deviceToken,
      ip: clientIpOf(request),
      userAgent: request.headers.get("user-agent"),
      sebVerified: seb.reason === "verified",
    });
    const payload = await windowPayload(attempt.id);
    return ok(payload);
  } catch (e) {
    return handleError(e);
  }
}
