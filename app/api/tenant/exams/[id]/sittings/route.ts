import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { DomainError, handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { assertCidrs, auditExam, findExam, sittingDTOs, sittingWriteSchema } from "@/lib/exams/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_READ.key);
    const { id } = await ctx.params;
    await findExam(actor.tenantId, id);
    return ok({ sittings: await sittingDTOs(id) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id } = await ctx.params;
    const body = sittingWriteSchema.parse(await request.json());
    await findExam(actor.tenantId, id);
    const ipAllowlist = assertCidrs(body.ipAllowlist) ?? [];
    if (body.startsAt && body.endsAt && body.endsAt <= body.startsAt) {
      throw new DomainError(400, "invalid_window", "The sitting must end after it starts.");
    }
    const sitting = await prisma.examSitting.create({
      data: {
        tenantId: actor.tenantId,
        examId: id,
        name: body.name,
        startsAt: body.startsAt ?? null,
        endsAt: body.endsAt ?? null,
        venue: body.venue ?? null,
        capacity: body.capacity ?? null,
        ipAllowlist,
      },
    });
    await auditExam(actor, request, "exam.sitting.create", { type: "ExamSitting", id: sitting.id }, {
      after: { examId: id, ...body, ipAllowlist },
    });
    return ok({ id: sitting.id }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
