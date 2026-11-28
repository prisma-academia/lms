import { z } from "zod";
import { rawPrisma } from "@/lib/db/raw-client";
import { enterContext } from "@/lib/db/tenant-context";
import { loadTenantPageContext } from "@/lib/db/page-context";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { enforceRateLimit, type RateLimitPreset } from "@/lib/auth/rate-limit";
import { clientIpOf, createExamSession } from "@/lib/exams/candidate-auth";

/**
 * Exam ID + PIN sign-in for candidates without (or not using) an account.
 * The session it creates opens one exam and nothing else.
 *
 * Wrong PINs lock the candidate for 15 minutes after 5 tries — kept in the
 * database, because the shared rate limiter fails open without Redis.
 */

const EXAM_LOGIN: RateLimitPreset = { name: "exam-login", limit: 20, windowSeconds: 10 * 60 };
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

const Body = z.object({
  candidateNo: z.string().min(3).max(40),
  pin: z.string().regex(/^\d{6}$/, "The PIN is 6 digits."),
});

const WRONG = "That Exam ID and PIN do not match. Check your slip and try again.";

let dummy: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummy ??= hashPassword("000000-not-a-real-pin");
  return dummy;
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const page = await loadTenantPageContext();
    if (page.mode !== "tenant" || !page.tenant || page.tenant.status !== "ACTIVE") {
      throw new DomainError(404, "not_found", "Exams are not available here.");
    }
    const tenantId = page.tenant.id;
    const ip = clientIpOf(request);
    await enforceRateLimit(EXAM_LOGIN, [tenantId, ip ?? "unknown"]);
    const body = Body.parse(await request.json());
    const candidateNo = body.candidateNo.trim().toUpperCase();

    const candidate = await rawPrisma.examCandidate.findFirst({
      where: { tenantId, candidateNo },
      include: { exam: { select: { id: true, status: true, pinLogin: true, title: true } } },
    });
    if (!candidate || !candidate.pinHash) {
      // Spend the same argon2 time as a real check, so response timing does
      // not reveal which Exam IDs exist.
      await verifyPassword(await dummyHash(), body.pin);
      throw new DomainError(401, "bad_credentials", WRONG);
    }
    if (candidate.pinLockedUntil && candidate.pinLockedUntil > new Date()) {
      const mins = Math.ceil((candidate.pinLockedUntil.getTime() - Date.now()) / 60_000);
      throw new DomainError(429, "pin_locked", `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask the invigilator.`);
    }
    const good = await verifyPassword(candidate.pinHash, body.pin);
    if (!good) {
      const failures = candidate.pinFailedAttempts + 1;
      await rawPrisma.examCandidate.update({
        where: { id: candidate.id },
        data: {
          pinFailedAttempts: failures >= MAX_FAILURES ? 0 : failures,
          pinLockedUntil: failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      throw new DomainError(401, "bad_credentials", WRONG);
    }
    if (!candidate.exam.pinLogin) throw new DomainError(403, "pin_disabled", "Sign in with your learner account for this exam.");
    if (candidate.exam.status !== "PUBLISHED" && candidate.exam.status !== "CLOSED") {
      throw new DomainError(403, "not_open", "This exam is not open yet.");
    }
    if (candidate.status !== "ACTIVE") throw new DomainError(403, "candidate_blocked", "You are not allowed to sit this exam. Speak to the invigilator.");

    await rawPrisma.examCandidate.update({ where: { id: candidate.id }, data: { pinFailedAttempts: 0, pinLockedUntil: null } });
    enterContext({ mode: "tenant-client", tenantId });
    await createExamSession({
      tenantId,
      candidateId: candidate.id,
      examId: candidate.exam.id,
      ip,
      userAgent: request.headers.get("user-agent"),
    });
    return ok({ examId: candidate.exam.id, title: candidate.exam.title });
  } catch (e) {
    return handleError(e);
  }
}
