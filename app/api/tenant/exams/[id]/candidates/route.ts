import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { DomainError, handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { auditExam, candidateRows, findExam } from "@/lib/exams/admin";
import { addCandidates, enrolleesOf, groupMembersOf, type NewCandidate } from "@/lib/exams/candidates";
import { addCandidatesSchema, learnersAsCandidates, prepareExternal } from "@/lib/exams/candidate-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_READ.key);
    const { id } = await ctx.params;
    await findExam(actor.tenantId, id);
    return ok({ candidates: await candidateRows(id) });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * Add candidates: chosen learners, a learner group, a course's enrollees or
 * external people. The response carries each new candidate's PIN — the only
 * time it is ever shown.
 */
export async function POST(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id } = await ctx.params;
    const body = addCandidatesSchema.parse(await request.json());
    const exam = await findExam(actor.tenantId, id);

    let inputs: NewCandidate[] = [];
    let skipped: { fullName: string; reason: string }[] = [];
    let source: string = body.mode;
    if (body.mode === "learners") {
      inputs = await learnersAsCandidates(actor.tenantId, body.clientIds);
      if (inputs.length !== new Set(body.clientIds).size) {
        throw new DomainError(400, "invalid_learner", "One or more learners are not in this academy.");
      }
    } else if (body.mode === "group") {
      const group = await prisma.clientGroup.findFirst({ where: { id: body.clientGroupId, tenantId: actor.tenantId }, select: { name: true } });
      if (!group) throw new DomainError(404, "not_found", "Learner group not found.");
      inputs = await groupMembersOf(body.clientGroupId);
      source = `group:${group.name}`;
    } else if (body.mode === "course") {
      const courseId = body.courseId ?? exam.courseId;
      if (!courseId) throw new DomainError(400, "course_required", "Choose a course, or link one to the exam first.");
      const course = await prisma.course.findFirst({ where: { id: courseId, tenantId: actor.tenantId }, select: { title: true } });
      if (!course) throw new DomainError(404, "not_found", "Course not found.");
      inputs = await enrolleesOf(courseId);
      source = `course:${course.title}`;
    } else {
      const prepared = await prepareExternal(actor.tenantId, id, body.candidates);
      inputs = prepared.add;
      skipped = prepared.skipped;
    }
    if (body.mode !== "external" && body.sittingId !== undefined) {
      inputs = inputs.map((i) => ({ ...i, sittingId: body.sittingId ?? null }));
    }
    if (!inputs.length) {
      return ok({ issued: [], added: 0, alreadyListed: 0, skipped });
    }

    const result = await addCandidates(id, inputs);
    const added = result.filter((r) => r.created);
    await auditExam(actor, request, "exam.candidates.add", { type: "Exam", id }, {
      after: { source, added: added.length, alreadyListed: result.length - added.length, skipped: skipped.length },
    });
    return ok(
      {
        issued: added,
        added: added.length,
        alreadyListed: result.length - added.length,
        skipped,
      },
      undefined,
      201
    );
  } catch (e) {
    return handleError(e);
  }
}
