import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { DomainError, handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  assertCertificate,
  assertCodeFree,
  assertCourse,
  auditExam,
  examDetail,
  examPatchSchema,
  findExam,
  isUniqueViolation,
} from "@/lib/exams/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_READ.key);
    const { id } = await ctx.params;
    const exam = await examDetail(actor.tenantId, id);
    if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
    return ok({ exam });
  } catch (e) {
    return handleError(e);
  }
}

/** Settings can change at any time; the paper has its own routes, which lock once sat. */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id } = await ctx.params;
    const body = examPatchSchema.parse(await request.json());
    const before = await findExam(actor.tenantId, id);

    if (body.code !== undefined) await assertCodeFree(actor.tenantId, body.code, id);
    if (body.courseId !== undefined) await assertCourse(actor.tenantId, body.courseId);
    if (body.certificateId !== undefined) await assertCertificate(actor.tenantId, body.certificateId);

    const opensAt = body.opensAt !== undefined ? body.opensAt : before.opensAt;
    const closesAt = body.closesAt !== undefined ? body.closesAt : before.closesAt;
    if (opensAt && closesAt && closesAt <= opensAt) {
      throw new DomainError(400, "invalid_window", "The exam must close after it opens.");
    }
    const kind = body.kind ?? before.kind;
    const courseId = body.courseId !== undefined ? body.courseId : before.courseId;
    if (kind === "COURSE" && !courseId) {
      throw new DomainError(400, "course_required", "A course exam needs a course. Choose one, or make it a standalone exam.");
    }
    const accessMode = body.accessMode ?? before.accessMode;
    const accessCode = body.accessCode !== undefined ? body.accessCode : before.accessCode;
    if (accessMode === "ACCESS_CODE" && !accessCode) {
      throw new DomainError(400, "access_code_required", "Set the access code learners will type to join.");
    }

    const data: Prisma.ExamUncheckedUpdateInput = {};
    const { gradeBandsJson, toolsJson, securityJson, ...scalars } = body;
    Object.assign(data, scalars);
    if (gradeBandsJson !== undefined) data.gradeBandsJson = [...gradeBandsJson].sort((a, b) => b.min - a.min) as object[];
    if (toolsJson !== undefined) data.toolsJson = toolsJson as object;
    if (securityJson !== undefined) data.securityJson = securityJson as object;

    let exam;
    try {
      exam = await prisma.exam.update({ where: { id }, data });
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError(409, "code_taken", "That code is already in use. Choose another.");
      throw e;
    }

    // The quit password lets an invigilator leave Safe Exam Browser; it has no
    // business in the activity log.
    const logged = securityJson
      ? { ...body, securityJson: { ...securityJson, seb: { ...securityJson.seb, quitPassword: securityJson.seb.quitPassword ? "(set)" : null } } }
      : body;
    await auditExam(actor, request, "exam.update", { type: "Exam", id }, {
      before: Object.fromEntries(Object.keys(body).map((k) => [k, k === "securityJson" ? "(previous policy)" : (before as Record<string, unknown>)[k]])),
      after: logged,
    });
    return ok({ exam: { id: exam.id, updatedAt: exam.updatedAt.toISOString() } });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id } = await ctx.params;
    const exam = await findExam(actor.tenantId, id);
    const attempts = await prisma.examAttempt.count({ where: { examId: id } });
    if (attempts > 0) {
      throw new DomainError(
        409,
        "has_attempts",
        `This exam has ${attempts} ${attempts === 1 ? "attempt" : "attempts"} and their results must be kept. Archive it instead: it disappears from candidates but the results stay.`
      );
    }
    const lessons = await prisma.lesson.count({
      where: { tenantId: actor.tenantId, contentType: "EXAM", contentJson: { path: ["examId"], equals: id } },
    });
    if (lessons > 0) {
      throw new DomainError(
        409,
        "in_lessons",
        `This exam is used by ${lessons} course ${lessons === 1 ? "lesson" : "lessons"}. Remove it from those lessons first, or archive it.`
      );
    }
    await prisma.exam.delete({ where: { id } });
    await auditExam(actor, request, "exam.delete", { type: "Exam", id }, { before: { title: exam.title, code: exam.code } });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
