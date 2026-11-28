import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { audit, requestMeta } from "@/lib/auth/audit";
import type { TenantActor } from "@/lib/auth/permissions";
import { accessibleBankWhere } from "@/lib/assessments/bank-access";
import {
  gradeBandsSchema,
  parseGradeBands,
  parsePools,
  parseSecurity,
  parseTools,
  poolRuleSchema,
  securitySchema,
  toolsSchema,
  type PoolRule,
} from "@/lib/exams/settings";
import { buildPaper, loadExamForPaper, PaperError, poolCandidates } from "@/lib/exams/paper";
import { isValidCidr } from "@/lib/exams/ip";
import type {
  CandidateRow,
  ChecklistItem,
  ExamCounts,
  ExamDetail,
  ExamSectionDTO,
  ExamSittingDTO,
} from "@/lib/exams/admin-dto";

/**
 * Server helpers for the exam-authoring admin (app/api/tenant/exams/** and
 * app/admin/(dashboard)/exams/**): request schemas, ownership checks, the
 * publish checklist and the detail shape the builder edits.
 */

export const LIVE_ATTEMPT_STATUSES = ["IN_PROGRESS", "PAUSED", "LOCKED"] as const;

/* ───────────────────────────── schemas ───────────────────────────── */

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const examCodeSchema = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .max(40, "Keep the code to 40 characters.")
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Use letters, digits, - and _ only (e.g. MTH101-MOCK).")
    .transform((s) => s.toUpperCase())
    .nullable()
);

export const dateInputSchema = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "Not a valid date.")
  .transform((s) => new Date(s));

const optionalText = (max: number) => z.preprocess(blankToNull, z.string().max(max).nullable());

export const examCreateSchema = z.object({
  title: z.string().trim().min(1, "Give the exam a title.").max(200),
  code: examCodeSchema.optional(),
  kind: z.enum(["COURSE", "STANDALONE"]).default("STANDALONE"),
  courseId: z.preprocess(blankToNull, z.string().min(1).nullable()).optional(),
  durationMin: z.number().int().min(1).max(1440).optional(),
});

export const examPatchSchema = z.object({
  title: z.string().trim().min(1, "Give the exam a title.").max(200).optional(),
  code: examCodeSchema.optional(),
  description: optionalText(2000).optional(),
  instructionsHtml: optionalText(20000).optional(),
  kind: z.enum(["COURSE", "STANDALONE"]).optional(),
  courseId: z.preprocess(blankToNull, z.string().min(1).nullable()).optional(),
  durationMin: z.number().int().min(1).max(1440).optional(),
  opensAt: dateInputSchema.nullable().optional(),
  closesAt: dateInputSchema.nullable().optional(),
  lateEntryMin: z.number().int().min(0).max(1440).nullable().optional(),
  attemptsAllowed: z.number().int().min(1).max(20).optional(),
  cooldownMin: z.number().int().min(0).max(43200).nullable().optional(),
  navigation: z.enum(["FREE", "LINEAR", "SECTION_LOCKED"]).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  passMark: z.number().int().min(0).max(100).optional(),
  negativeMarking: z.number().min(0).max(1).nullable().optional(),
  gradeBandsJson: gradeBandsSchema.optional(),
  resultRelease: z.enum(["IMMEDIATE", "AFTER_CLOSE", "MANUAL"]).optional(),
  reviewMode: z.enum(["NONE", "SCORE_ONLY", "ANSWERS", "ANSWERS_WITH_EXPLANATIONS"]).optional(),
  calculator: z.enum(["NONE", "BASIC", "SCIENTIFIC"]).optional(),
  formulaSheetHtml: optionalText(20000).optional(),
  toolsJson: toolsSchema.optional(),
  securityJson: securitySchema.optional(),
  accessMode: z.enum(["INVITED", "ENROLLED", "ACCESS_CODE"]).optional(),
  accessCode: z.preprocess(blankToNull, z.string().trim().min(4, "Use at least 4 characters.").max(40).nullable()).optional(),
  pinLogin: z.boolean().optional(),
  offlineGraceMin: z.number().int().min(0).max(60).optional(),
  certificateId: z.preprocess(blankToNull, z.string().min(1).nullable()).optional(),
});
export type ExamPatch = z.infer<typeof examPatchSchema>;

export const poolsSchema = z
  .array(poolRuleSchema)
  .max(30)
  .refine((rules) => new Set(rules.map((r) => r.id)).size === rules.length, "Each pool rule needs its own id.");

export const sittingWriteSchema = z.object({
  name: z.string().trim().min(1, "Name the sitting.").max(120),
  startsAt: dateInputSchema.nullable().optional(),
  endsAt: dateInputSchema.nullable().optional(),
  venue: optionalText(200).optional(),
  capacity: z.number().int().min(1).max(100000).nullable().optional(),
  ipAllowlist: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
});

export function assertCidrs(entries: string[] | undefined): string[] | undefined {
  if (!entries) return undefined;
  const clean = [...new Set(entries.map((e) => e.trim()).filter(Boolean))];
  const bad = clean.filter((e) => !isValidCidr(e));
  if (bad.length) {
    throw new DomainError(
      400,
      "invalid_ip",
      `Not a valid IP address or range: ${bad.join(", ")}. Use forms like 41.58.10.0/24, 102.89.12.7 or 2001:db8::/32.`
    );
  }
  return clean;
}

/* ───────────────────────────── ownership ───────────────────────────── */

export async function findExam(tenantId: string, id: string) {
  const exam = await prisma.exam.findFirst({ where: { id, tenantId } });
  if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
  return exam;
}

export async function assertCodeFree(tenantId: string, code: string | null | undefined, exceptId?: string) {
  if (!code) return;
  const taken = await prisma.exam.findFirst({
    where: { tenantId, code, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { title: true },
  });
  if (taken) {
    throw new DomainError(409, "code_taken", `The code ${code} is already used by "${taken.title}". Choose another.`);
  }
}

export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "P2002";
}

export async function assertCourse(tenantId: string, courseId: string | null | undefined) {
  if (!courseId) return;
  const found = await prisma.course.findFirst({ where: { id: courseId, tenantId }, select: { id: true } });
  if (!found) throw new DomainError(400, "invalid_course", "That course is not in this academy.");
}

export async function assertCertificate(tenantId: string, certificateId: string | null | undefined) {
  if (!certificateId) return;
  const found = await prisma.certificate.findFirst({ where: { id: certificateId, tenantId }, select: { id: true } });
  if (!found) throw new DomainError(400, "invalid_certificate", "That certificate template is not in this academy.");
}

/**
 * An EXAM lesson (`contentJson: { examId }`) must point at an exam of this
 * academy. Other content types pass through untouched.
 */
export async function assertExamLessonContent(
  tenantId: string,
  contentType: string,
  contentJson: Record<string, unknown> | undefined
) {
  if (contentType !== "EXAM") return;
  const examId = contentJson?.examId;
  if (typeof examId !== "string" || !examId) {
    throw new DomainError(400, "exam_required", "Choose the exam this lesson opens.");
  }
  const exam = await prisma.exam.findFirst({ where: { id: examId, tenantId }, select: { id: true } });
  if (!exam) throw new DomainError(400, "invalid_exam", "That exam is not in this academy.");
}

/** Every bank a pool draws from must be one this member of staff can open. */
export async function assertBanksAccessible(actor: TenantActor, bankIds: string[]) {
  const ids = [...new Set(bankIds)];
  if (!ids.length) return;
  const access = await accessibleBankWhere(actor);
  const found = await prisma.questionBank.count({ where: { AND: [{ id: { in: ids }, tenantId: actor.tenantId }, access] } });
  if (found !== ids.length) {
    throw new DomainError(400, "invalid_bank", "A pool draws from a question bank you cannot use.");
  }
}

/**
 * The paper of an exam that has been sat cannot change: those candidates are
 * marked against the questions they were given, and results across attempts
 * must compare like with like.
 */
export async function assertPaperEditable(examId: string) {
  const attempts = await prisma.examAttempt.count({ where: { examId } });
  if (attempts > 0) {
    throw new DomainError(
      409,
      "paper_locked",
      `Candidates have already started this exam (${attempts} ${attempts === 1 ? "attempt" : "attempts"}), so its questions, sections and pools are locked. Settings can still change. For a revised paper, create a new exam.`
    );
  }
}

/* ───────────────────────────── audit ───────────────────────────── */

export async function auditExam(
  actor: TenantActor,
  request: Request,
  action: string,
  target: { type: string; id: string },
  data: { before?: unknown; after?: unknown } = {}
) {
  const meta = requestMeta(request);
  // Through JSON once, so Dates become strings before they reach a Json column.
  const plain = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as unknown));
  await audit({
    actorType: "TENANT_USER",
    actorId: actor.userId,
    action,
    tenantId: actor.tenantId,
    targetType: target.type,
    targetId: target.id,
    before: plain(data.before),
    after: plain(data.after),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

/* ───────────────────────────── reads ───────────────────────────── */

export async function examCounts(examId: string): Promise<ExamCounts> {
  const [candidates, grouped] = await Promise.all([
    prisma.examCandidate.count({ where: { examId } }),
    prisma.examAttempt.groupBy({ by: ["status"], where: { examId }, _count: { _all: true } }),
  ]);
  let attempts = 0;
  let live = 0;
  let submitted = 0;
  for (const g of grouped) {
    attempts += g._count._all;
    if ((LIVE_ATTEMPT_STATUSES as readonly string[]).includes(g.status)) live += g._count._all;
    if (g.status === "SUBMITTED" || g.status === "TERMINATED") submitted += g._count._all;
  }
  return { candidates, attempts, live, submitted };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function sectionDTOs(examId: string): Promise<ExamSectionDTO[]> {
  const sections = await prisma.examSection.findMany({
    where: { examId },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          question: {
            select: {
              id: true,
              type: true,
              prompt: true,
              points: true,
              difficulty: true,
              bankId: true,
              bank: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  return sections.map((s) => ({
    id: s.id,
    title: s.title,
    instructions: s.instructions,
    sortOrder: s.sortOrder,
    timeLimitMin: s.timeLimitMin,
    shuffle: s.shuffle,
    pools: parsePools(s.poolsJson),
    items: s.items.map((it) => ({
      id: it.id,
      questionId: it.questionId,
      points: it.points,
      question: {
        id: it.question.id,
        type: it.question.type,
        prompt: it.question.prompt,
        points: it.question.points,
        difficulty: it.question.difficulty,
        bankId: it.question.bankId,
        bankName: it.question.bank.name,
      },
    })),
  }));
}

export async function sittingDTOs(examId: string): Promise<ExamSittingDTO[]> {
  const rows = await prisma.examSitting.findMany({
    where: { examId },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { candidates: true } } },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    startsAt: iso(s.startsAt),
    endsAt: iso(s.endsAt),
    venue: s.venue,
    capacity: s.capacity,
    ipAllowlist: s.ipAllowlist,
    pausedAt: iso(s.pausedAt),
    candidateCount: s._count.candidates,
  }));
}

export async function examDetail(tenantId: string, id: string): Promise<ExamDetail | null> {
  const exam = await prisma.exam.findFirst({ where: { id, tenantId } });
  if (!exam) return null;
  const availability = await paperAvailability(id);
  const [sections, sittings, counts, checklist] = await Promise.all([
    sectionDTOs(id),
    sittingDTOs(id),
    examCounts(id),
    publishChecklist(tenantId, id, availability),
  ]);
  return {
    id: exam.id,
    title: exam.title,
    code: exam.code,
    description: exam.description,
    instructionsHtml: exam.instructionsHtml,
    status: exam.status,
    kind: exam.kind,
    courseId: exam.courseId,
    durationMin: exam.durationMin,
    opensAt: iso(exam.opensAt),
    closesAt: iso(exam.closesAt),
    lateEntryMin: exam.lateEntryMin,
    attemptsAllowed: exam.attemptsAllowed,
    cooldownMin: exam.cooldownMin,
    navigation: exam.navigation,
    shuffleQuestions: exam.shuffleQuestions,
    shuffleOptions: exam.shuffleOptions,
    passMark: exam.passMark,
    negativeMarking: exam.negativeMarking,
    gradeBands: parseGradeBands(exam.gradeBandsJson),
    resultRelease: exam.resultRelease,
    reviewMode: exam.reviewMode,
    calculator: exam.calculator,
    formulaSheetHtml: exam.formulaSheetHtml,
    tools: parseTools(exam.toolsJson),
    security: parseSecurity(exam.securityJson),
    accessMode: exam.accessMode,
    accessCode: exam.accessCode,
    pinLogin: exam.pinLogin,
    offlineGraceMin: exam.offlineGraceMin,
    certificateId: exam.certificateId,
    publishedAt: iso(exam.publishedAt),
    createdAt: exam.createdAt.toISOString(),
    updatedAt: exam.updatedAt.toISOString(),
    sections,
    sittings,
    counts,
    estimatedPoints: availability.estimatedTotalPoints,
    checklist,
  };
}

export async function candidateRows(examId: string): Promise<CandidateRow[]> {
  const rows = await prisma.examCandidate.findMany({
    where: { examId },
    orderBy: [{ fullName: "asc" }, { createdAt: "asc" }],
    take: 5000,
    include: {
      sitting: { select: { name: true } },
      _count: { select: { attempts: true } },
      attempts: {
        orderBy: { attemptNo: "desc" },
        take: 1,
        select: { id: true, attemptNo: true, status: true, scorePercent: true, passed: true, gradingStatus: true },
      },
    },
  });
  const now = Date.now();
  return rows.map((c) => ({
    id: c.id,
    candidateNo: c.candidateNo,
    fullName: c.fullName,
    email: c.email,
    regNumber: c.regNumber,
    clientId: c.clientId,
    sittingId: c.sittingId,
    sittingName: c.sitting?.name ?? null,
    extraTimePct: c.extraTimePct,
    status: c.status,
    hasPin: !!c.pinHash,
    pinLocked: !!c.pinLockedUntil && c.pinLockedUntil.getTime() > now,
    attemptCount: c._count.attempts,
    latestAttempt: c.attempts[0] ?? null,
  }));
}

/* ───────────────────────────── pools ───────────────────────────── */

export type PoolRuleAvailability = {
  id: string;
  sectionId: string;
  count: number;
  /** Questions the rule can draw, not counting ones already placed in the paper. */
  available: number;
  ok: boolean;
  estimatedPoints: number;
};

export type PaperAvailability = {
  sections: { sectionId: string; title: string; fixedCount: number; fixedPoints: number; rules: PoolRuleAvailability[] }[];
  fixedCount: number;
  poolCount: number;
  questionCount: number;
  estimatedTotalPoints: number;
  problems: string[];
};

/** Every question placed by hand anywhere in the exam (pools never draw these). */
async function fixedQuestionIds(examId: string): Promise<Set<string>> {
  const items = await prisma.examSectionItem.findMany({ where: { section: { examId } }, select: { questionId: true } });
  return new Set(items.map((i) => i.questionId));
}

export async function draftRuleAvailability(examId: string, rule: PoolRule): Promise<number> {
  return (await poolCandidates(rule, await fixedQuestionIds(examId))).length;
}

export async function paperAvailability(examId: string): Promise<PaperAvailability> {
  const exam = await loadExamForPaper(examId);
  if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
  const fixed = new Set<string>();
  for (const s of exam.sections) for (const it of s.items) fixed.add(it.questionId);

  const problems: string[] = [];
  const sections: PaperAvailability["sections"] = [];
  let fixedCount = 0;
  let poolCount = 0;
  let total = 0;
  for (const s of exam.sections) {
    const fixedPoints = s.items.reduce((n, it) => n + (it.points ?? it.question.points), 0);
    fixedCount += s.items.length;
    total += fixedPoints;
    const rules: PoolRuleAvailability[] = [];
    for (const rule of parsePools(s.poolsJson)) {
      const pool = await poolCandidates(rule, fixed);
      const avg = pool.length ? pool.reduce((n, q) => n + q.points, 0) / pool.length : 0;
      const estimatedPoints = Math.round((rule.points ?? avg) * rule.count);
      const ok = pool.length >= rule.count;
      if (!ok) {
        problems.push(
          `"${s.title}": a pool asks for ${rule.count} ${rule.count === 1 ? "question" : "questions"} but only ${pool.length} match.`
        );
      }
      rules.push({ id: rule.id, sectionId: s.id, count: rule.count, available: pool.length, ok, estimatedPoints });
      poolCount += rule.count;
      total += estimatedPoints;
    }
    sections.push({ sectionId: s.id, title: s.title, fixedCount: s.items.length, fixedPoints, rules });
  }

  // Two pools over the same questions can each look satisfiable on their own
  // and still run dry together; a real draw is the only honest check.
  if (problems.length === 0 && fixedCount + poolCount > 0) {
    try {
      await buildPaper(exam, 1);
    } catch (e) {
      if (e instanceof PaperError) problems.push(`${e.message} Pools in the same section may be drawing from the same questions.`);
      else throw e;
    }
  }
  return { sections, fixedCount, poolCount, questionCount: fixedCount + poolCount, estimatedTotalPoints: total, problems };
}

/* ───────────────────────────── publishing ───────────────────────────── */

/** Everything that must be true before candidates can see the exam. `error` blocks publishing. */
export async function publishChecklist(
  tenantId: string,
  examId: string,
  precomputed?: PaperAvailability
): Promise<ChecklistItem[]> {
  const exam = await prisma.exam.findFirst({ where: { id: examId, tenantId } });
  if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
  const [availability, candidates, sittings, certificate] = await Promise.all([
    precomputed ?? paperAvailability(examId),
    prisma.examCandidate.count({ where: { examId } }),
    prisma.examSitting.findMany({ where: { examId }, select: { name: true, startsAt: true, endsAt: true } }),
    exam.certificateId
      ? prisma.certificate.findFirst({ where: { id: exam.certificateId, tenantId }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  const security = parseSecurity(exam.securityJson);
  const now = Date.now();
  const items: ChecklistItem[] = [];

  items.push(
    availability.questionCount > 0
      ? {
          key: "questions",
          label: "Questions",
          level: "ok",
          detail: `${availability.questionCount} ${availability.questionCount === 1 ? "question" : "questions"}, about ${availability.estimatedTotalPoints} points.`,
        }
      : { key: "questions", label: "Questions", level: "error", detail: "Add at least one question or random pool on the Paper tab." }
  );

  if (availability.questionCount > 0) {
    items.push(
      availability.problems.length
        ? { key: "pools", label: "Random pools", level: "error", detail: availability.problems.join(" ") }
        : {
            key: "pools",
            label: "Random pools",
            level: "ok",
            detail: availability.poolCount ? "Every pool has enough questions to draw from." : "No random pools: every candidate gets the same questions.",
          }
    );
  }

  const opens = exam.opensAt?.getTime() ?? null;
  const closes = exam.closesAt?.getTime() ?? null;
  if (opens != null && closes != null && closes <= opens) {
    items.push({ key: "window", label: "Exam window", level: "error", detail: "The exam closes before it opens." });
  } else if (closes != null && closes <= now) {
    items.push({ key: "window", label: "Exam window", level: "error", detail: "The closing time is in the past. Move it later." });
  } else if (opens == null && closes == null) {
    items.push({
      key: "window",
      label: "Exam window",
      level: "warn",
      detail: "No window set: candidates can start as soon as it is published, at any time.",
    });
  } else {
    items.push({ key: "window", label: "Exam window", level: "ok", detail: "Opening and closing times are set." });
  }

  const badSitting = sittings.find((s) => s.startsAt && s.endsAt && s.endsAt <= s.startsAt);
  if (badSitting) {
    items.push({ key: "sittings", label: "Sittings", level: "error", detail: `Sitting "${badSitting.name}" ends before it starts.` });
  }

  if (security.lockdown === "SEB_REQUIRED") {
    const keys = security.seb.configKeys.length + security.seb.browserExamKeys.length;
    items.push(
      keys > 0
        ? { key: "seb", label: "Safe Exam Browser", level: "ok", detail: `${keys} SEB ${keys === 1 ? "key" : "keys"} set.` }
        : {
            key: "seb",
            label: "Safe Exam Browser",
            level: "error",
            detail: "Safe Exam Browser is required but no Config Key is set, so nobody could get in. Add one on the Security tab.",
          }
    );
  }

  if (exam.accessMode === "INVITED") {
    items.push(
      candidates > 0
        ? { key: "candidates", label: "Candidates", level: "ok", detail: `${candidates} ${candidates === 1 ? "candidate" : "candidates"} on the list.` }
        : { key: "candidates", label: "Candidates", level: "error", detail: "Only invited candidates can sit this exam, and the list is empty." }
    );
  } else if (exam.accessMode === "ENROLLED") {
    items.push(
      exam.courseId
        ? { key: "candidates", label: "Candidates", level: "ok", detail: "Learners enrolled on the linked course can sit it." }
        : { key: "candidates", label: "Candidates", level: "error", detail: "Open to course enrollees, but no course is linked." }
    );
  } else {
    items.push(
      exam.accessCode
        ? { key: "candidates", label: "Candidates", level: "ok", detail: "Learners with the access code can join." }
        : { key: "candidates", label: "Candidates", level: "error", detail: "Open to anyone with the access code, but no code is set." }
    );
  }

  if (exam.kind === "COURSE" && !exam.courseId) {
    items.push({ key: "course", label: "Course", level: "error", detail: "This is a course exam but no course is linked." });
  }

  if (exam.certificateId) {
    items.push(
      certificate
        ? { key: "certificate", label: "Certificate", level: "ok", detail: "A certificate is awarded on a pass." }
        : { key: "certificate", label: "Certificate", level: "error", detail: "The chosen certificate template no longer exists." }
    );
  }

  return items;
}
