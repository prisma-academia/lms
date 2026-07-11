import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";

const CreateBody = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    amountCents: z.number().int().min(1),
    currency: z.string().length(3).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    clientId: z.string().min(1).nullable().optional(),
    clientGroupId: z.string().min(1).nullable().optional(),
  })
  .refine((b) => Boolean(b.clientId) !== Boolean(b.clientGroupId), {
    message: "Set exactly one target: a client or a client group.",
    path: ["clientId"],
  });

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_FEES_READ.key);
    const { cursor, take } = parsePagination(new URL(request.url).searchParams);
    const rows = await prisma.fee.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        client: { select: { email: true, firstName: true, lastName: true } },
        clientGroup: { select: { name: true } },
        _count: { select: { payments: true } },
      },
    });
    return ok(rows, buildPageMeta(rows, take));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_FEES_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);

    if (body.clientId) {
      const client = await prisma.client.findFirst({ where: { id: body.clientId, tenantId: actor.tenantId } });
      if (!client) throw new DomainError(400, "invalid_target", "Client not found in this tenant.");
    }
    if (body.clientGroupId) {
      const group = await prisma.clientGroup.findFirst({
        where: { id: body.clientGroupId, tenantId: actor.tenantId },
      });
      if (!group) throw new DomainError(400, "invalid_target", "Client group not found in this tenant.");
    }

    const fee = await prisma.fee.create({
      data: {
        tenantId: actor.tenantId,
        name: body.name,
        description: body.description ?? null,
        amountCents: body.amountCents,
        currency: body.currency ?? "NGN",
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        clientId: body.clientId ?? null,
        clientGroupId: body.clientGroupId ?? null,
      },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "fee.create",
      tenantId: actor.tenantId,
      targetType: "Fee",
      targetId: fee.id,
      after: { name: fee.name, amountCents: fee.amountCents } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ fee }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
