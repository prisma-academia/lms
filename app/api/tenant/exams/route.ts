import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { DomainError, handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import {
  assertCodeFree,
  assertCourse,
  auditExam,
  examCreateSchema,
  isUniqueViolation,
  LIVE_ATTEMPT_STATUSES,
} from "@/lib/exams/admin";
import { securitySchema } from "@/lib/exams/settings";
import type { ExamListRow } from "@/lib/exams/admin-dto";

export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_READ.key);
    const exams = await prisma.exam.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        course: { select: { title: true } },
        _count: { select: { candidates: true, attempts: true } },
      },
    });
    const live = exams.length
      ? await prisma.examAttempt.groupBy({
          by: ["examId"],
          where: { tenantId: actor.tenantId, examId: { in: exams.map((e) => e.id) }, status: { in: [...LIVE_ATTEMPT_STATUSES] } },
          _count: { _all: true },
        })
      : [];
    const liveBy = new Map(live.map((l) => [l.examId, l._count._all]));
    const rows: ExamListRow[] = exams.map((e) => ({
      id: e.id,
      title: e.title,
      code: e.code,
      status: e.status,
      kind: e.kind,
      durationMin: e.durationMin,
      opensAt: e.opensAt?.toISOString() ?? null,
      closesAt: e.closesAt?.toISOString() ?? null,
      courseTitle: e.course?.title ?? null,
      candidates: e._count.candidates,
      attempts: e._count.attempts,
      live: liveBy.get(e.id) ?? 0,
    }));
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const body = examCreateSchema.parse(await request.json());
    const code = body.code ?? null;
    await assertCodeFree(actor.tenantId, code);
    if (body.kind === "COURSE" && !body.courseId) {
      throw new DomainError(400, "course_required", "Choose the course this exam belongs to.");
    }
    await assertCourse(actor.tenantId, body.courseId);

    let exam;
    try {
      exam = await prisma.exam.create({
        data: {
          tenantId: actor.tenantId,
          title: body.title,
          code,
          kind: body.kind,
          courseId: body.courseId ?? null,
          durationMin: body.durationMin ?? 60,
          // A course exam is for the course's learners unless staff narrow it.
          accessMode: body.kind === "COURSE" ? "ENROLLED" : "INVITED",
          securityJson: securitySchema.parse({}) as object,
          createdById: actor.userId,
          sections: { create: [{ tenantId: actor.tenantId, title: "Section A", sortOrder: 0 }] },
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError(409, "code_taken", `The code ${code} is already in use. Choose another.`);
      throw e;
    }
    await auditExam(actor, request, "exam.create", { type: "Exam", id: exam.id }, {
      after: { title: exam.title, code: exam.code, kind: exam.kind, courseId: exam.courseId },
    });
    return ok({ id: exam.id }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
