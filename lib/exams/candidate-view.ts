import { prisma } from "@/lib/db/client";
import { parsePaper, candidatePackage } from "@/lib/exams/paper";
import { parseSecurity, parseTools } from "@/lib/exams/settings";
import { isPaused, remainingMs, windowState } from "@/lib/exams/timing";
import { OPEN_STATUSES } from "@/lib/exams/attempts";

/**
 * What the candidate's screens are told. Built here, field by field, so no
 * route ever spreads an exam or question row (with keys, rubrics or staff
 * notes) into a candidate response.
 */

type ExamRow = NonNullable<Awaited<ReturnType<typeof prisma.exam.findFirst>>>;
type CandidateRow = NonNullable<Awaited<ReturnType<typeof prisma.examCandidate.findFirst>>> & {
  sitting: { id: string; name: string; startsAt: Date | null; endsAt: Date | null; venue: string | null; pausedAt: Date | null } | null;
};

/** The security switches the exam window acts on (no SEB keys, no quit password). */
export function clientSecurity(exam: ExamRow) {
  const s = parseSecurity(exam.securityJson);
  return {
    lockdown: s.lockdown,
    requireFullscreen: s.requireFullscreen,
    blockClipboard: s.blockClipboard,
    blockContextMenu: s.blockContextMenu,
    blockPrint: s.blockPrint,
    blockShortcuts: s.blockShortcuts,
    detectTabSwitch: s.detectTabSwitch,
    detectMultiScreen: s.detectMultiScreen,
    watermark: s.watermark,
    maxViolations: s.maxViolations,
    onMaxViolations: s.onMaxViolations,
    awayAutoSubmitSec: s.awayAutoSubmitSec,
  };
}
export type ClientSecurity = ReturnType<typeof clientSecurity>;

export async function lobbyState(exam: ExamRow, candidate: CandidateRow) {
  const now = new Date();
  const [attempts, sectionCount, itemCount] = await Promise.all([
    prisma.examAttempt.findMany({
      where: { candidateId: candidate.id },
      orderBy: { attemptNo: "desc" },
      select: { id: true, attemptNo: true, status: true, submittedAt: true, releasedAt: true, scorePercent: true, passed: true, grade: true, gradingStatus: true },
    }),
    prisma.examSection.count({ where: { examId: exam.id } }),
    prisma.examSectionItem.count({ where: { section: { examId: exam.id } } }),
  ]);
  const open = attempts.find((a) => (OPEN_STATUSES as readonly string[]).includes(a.status)) ?? null;
  const used = attempts.length;
  const state = windowState(exam, candidate.sitting, now);
  const security = clientSecurity(exam);
  return {
    serverNow: now.toISOString(),
    exam: {
      id: exam.id,
      title: exam.title,
      code: exam.code,
      description: exam.description,
      instructions: exam.instructionsHtml,
      durationMin: exam.durationMin,
      opensAt: exam.opensAt?.toISOString() ?? null,
      closesAt: exam.closesAt?.toISOString() ?? null,
      attemptsAllowed: exam.attemptsAllowed,
      navigation: exam.navigation,
      calculator: exam.calculator,
      passMark: exam.passMark,
      negativeMarking: exam.negativeMarking,
      sectionCount,
      fixedItemCount: itemCount,
      security,
    },
    candidate: {
      id: candidate.id,
      fullName: candidate.fullName,
      candidateNo: candidate.candidateNo,
      regNumber: candidate.regNumber,
      extraTimePct: candidate.extraTimePct,
      sitting: candidate.sitting
        ? {
            name: candidate.sitting.name,
            venue: candidate.sitting.venue,
            startsAt: candidate.sitting.startsAt?.toISOString() ?? null,
            endsAt: candidate.sitting.endsAt?.toISOString() ?? null,
          }
        : null,
    },
    window: state,
    attemptsUsed: used,
    openAttemptId: open?.id ?? null,
    canStart: !!open || (state === "open" && used < exam.attemptsAllowed && candidate.status === "ACTIVE"),
    past: attempts
      .filter((a) => a.status === "SUBMITTED" || a.status === "TERMINATED")
      .map((a) => ({
        id: a.id,
        attemptNo: a.attemptNo,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        released: !!a.releasedAt,
        scorePercent: a.releasedAt ? a.scorePercent : null,
        passed: a.releasedAt ? a.passed : null,
        grade: a.releasedAt ? a.grade : null,
      })),
  };
}

/** Everything the exam window needs to run, including offline. */
export async function windowPayload(attemptId: string) {
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId },
    include: {
      exam: true,
      candidate: { include: { sitting: { select: { pausedAt: true } } } },
      responses: { select: { itemKey: true, answerJson: true, flagged: true, rev: true, timeSpentSec: true } },
    },
  });
  if (!attempt) return null;
  const now = new Date();
  const paper = parsePaper(attempt.paperJson);
  const pkg = await candidatePackage(paper, attempt.seed);
  const tools = parseTools(attempt.exam.toolsJson);
  const sittingPausedAt = attempt.candidate.sitting?.pausedAt ?? null;
  return {
    attemptId: attempt.id,
    examId: attempt.examId,
    serverNow: now.toISOString(),
    deadlineAt: attempt.deadlineAt.toISOString(),
    remainingMs: remainingMs(attempt, now, sittingPausedAt),
    status: attempt.status,
    paused: isPaused(attempt, sittingPausedAt),
    violationCount: attempt.violationCount,
    exam: {
      title: attempt.exam.title,
      navigation: attempt.exam.navigation,
      calculator: attempt.exam.calculator,
      formulaSheet: attempt.exam.formulaSheetHtml,
      tools,
      security: clientSecurity(attempt.exam),
      negativeMarking: attempt.exam.negativeMarking != null,
    },
    candidate: { fullName: attempt.candidate.fullName, candidateNo: attempt.candidate.candidateNo },
    pkg,
    responses: attempt.responses.map((r) => ({
      key: r.itemKey,
      answer: r.answerJson,
      flagged: r.flagged,
      rev: r.rev,
      timeSpentSec: r.timeSpentSec,
    })),
  };
}
export type WindowPayload = NonNullable<Awaited<ReturnType<typeof windowPayload>>>;
