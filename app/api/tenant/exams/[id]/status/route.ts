import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { DomainError, handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { auditExam, findExam } from "@/lib/exams/admin";

const Body = z.object({ status: z.enum(["DRAFT", "CLOSED", "ARCHIVED"]) });

/** Unpublish, close or archive. Publishing has its own route (it runs the checklist). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id } = await ctx.params;
    const { status } = Body.parse(await request.json());
    const before = await findExam(actor.tenantId, id);

    if (status === "DRAFT") {
      const attempts = await prisma.examAttempt.count({ where: { examId: id } });
      if (attempts > 0) {
        throw new DomainError(
          409,
          "has_attempts",
          "Candidates have already sat this exam, so it cannot go back to draft. Close it to stop new attempts, or archive it."
        );
      }
    }
    const exam = await prisma.exam.update({ where: { id }, data: { status } });
    await auditExam(actor, request, `exam.status.${status.toLowerCase()}`, { type: "Exam", id }, {
      before: { status: before.status },
      after: { status },
    });
    return ok({ status: exam.status });
  } catch (e) {
    return handleError(e);
  }
}
