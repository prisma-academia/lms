import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  passingScore: z.number().int().min(0).max(100).nullable().optional(),
  timeLimitMin: z.number().int().min(1).max(600).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_QUIZZES_READ.key);
    const { cursor, take } = parsePagination(new URL(request.url).searchParams);
    const rows = await prisma.quiz.findMany({
      where: { tenantId: actor.tenantId },
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
    const quiz = await prisma.quiz.create({
      data: {
        tenantId: actor.tenantId,
        title: body.title,
        description: body.description ?? null,
        passingScore: body.passingScore ?? null,
        timeLimitMin: body.timeLimitMin ?? null,
      },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "quiz.create",
      tenantId: actor.tenantId,
      targetType: "Quiz",
      targetId: quiz.id,
      after: { title: quiz.title } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ quiz }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
