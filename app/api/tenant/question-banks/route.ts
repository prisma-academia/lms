import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";
import { accessibleBankWhere } from "@/lib/assessments/bank-access";

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_READ.key);
    const { cursor, take } = parsePagination(new URL(request.url).searchParams);
    const access = await accessibleBankWhere(actor);
    const rows = await prisma.questionBank.findMany({
      where: { AND: [{ tenantId: actor.tenantId }, access] },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { _count: { select: { questions: true } } },
    });
    return ok(rows, buildPageMeta(rows, take));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);

    const bank = await prisma.questionBank.create({
      data: {
        tenantId: actor.tenantId,
        name: body.name,
        description: body.description ?? null,
      },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "question_bank.create",
      tenantId: actor.tenantId,
      targetType: "QuestionBank",
      targetId: bank.id,
      after: { name: bank.name } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ bank }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
