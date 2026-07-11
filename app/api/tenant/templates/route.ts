import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";

const CreateBody = z.object({
  type: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  contentJson: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_TEMPLATES_READ.key);
    const { cursor, take } = parsePagination(new URL(request.url).searchParams);
    const rows = await prisma.template.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    return ok(rows, buildPageMeta(rows, take));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_TEMPLATES_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);
    const template = await prisma.template.create({
      data: {
        tenantId: actor.tenantId,
        type: body.type,
        name: body.name,
        contentJson: (body.contentJson ?? {}) as object,
      },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "template.create",
      tenantId: actor.tenantId,
      targetType: "Template",
      targetId: template.id,
      after: { name: template.name, type: template.type } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ template }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
