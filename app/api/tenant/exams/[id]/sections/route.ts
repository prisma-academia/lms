import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { assertPaperEditable, auditExam, findExam } from "@/lib/exams/admin";

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  instructions: z.string().max(5000).nullable().optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id } = await ctx.params;
    const body = CreateBody.parse(await request.json().catch(() => ({})));
    await findExam(actor.tenantId, id);
    await assertPaperEditable(id);

    const existing = await prisma.examSection.findMany({ where: { examId: id }, select: { sortOrder: true } });
    const next = existing.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1;
    const letter = existing.length < 26 ? String.fromCharCode(65 + existing.length) : String(existing.length + 1);
    const section = await prisma.examSection.create({
      data: {
        tenantId: actor.tenantId,
        examId: id,
        title: body.title ?? `Section ${letter}`,
        instructions: body.instructions?.trim() || null,
        sortOrder: next,
      },
    });
    await auditExam(actor, request, "exam.section.create", { type: "ExamSection", id: section.id }, {
      after: { examId: id, title: section.title },
    });
    return ok(
      {
        section: {
          id: section.id,
          title: section.title,
          instructions: section.instructions,
          sortOrder: section.sortOrder,
          timeLimitMin: section.timeLimitMin,
          shuffle: section.shuffle,
          pools: [],
          items: [],
        },
      },
      undefined,
      201
    );
  } catch (e) {
    return handleError(e);
  }
}
