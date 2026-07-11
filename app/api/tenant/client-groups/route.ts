import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";

const CreateBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_GROUPS_READ.key);
    const { cursor, take } = parsePagination(new URL(request.url).searchParams);
    const rows = await prisma.clientGroup.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { _count: { select: { memberships: true } } },
    });
    return ok(rows, buildPageMeta(rows, take));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_GROUPS_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);

    const existing = await prisma.clientGroup.findUnique({
      where: { tenantId_name: { tenantId: actor.tenantId, name: body.name } },
    });
    if (existing) throw new DomainError(409, "name_taken", "A client group with that name already exists.");

    const group = await prisma.clientGroup.create({
      data: {
        tenantId: actor.tenantId,
        name: body.name,
        description: body.description ?? null,
      },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "client_group.create",
      tenantId: actor.tenantId,
      targetType: "ClientGroup",
      targetId: group.id,
      after: { name: group.name } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ group }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
