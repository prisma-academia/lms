import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const Base = {
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  type: z.enum(["LIVE_SESSION", "DEADLINE", "REMINDER", "ANNOUNCEMENT"]),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  url: z.string().url().max(500).nullable().optional(),
  audience: z.enum(["ALL", "CLIENT", "GROUP"]),
  clientId: z.string().min(1).nullable().optional(),
  clientGroupId: z.string().min(1).nullable().optional(),
  recurrence: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).optional(),
  recurrenceUntil: z.string().datetime().nullable().optional(),
};

const CreateBody = z.object(Base).refine(
  (b) =>
    (b.audience === "ALL" && !b.clientId && !b.clientGroupId) ||
    (b.audience === "CLIENT" && b.clientId && !b.clientGroupId) ||
    (b.audience === "GROUP" && b.clientGroupId && !b.clientId),
  { message: "Audience target does not match the selected audience.", path: ["audience"] }
);

export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EVENTS_READ.key);
    const events = await prisma.event.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { startAt: "asc" },
      take: 1000,
      include: {
        client: { select: { email: true } },
        clientGroup: { select: { name: true } },
      },
    });
    return ok({ events });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EVENTS_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);

    if (body.clientId) {
      const client = await prisma.client.findFirst({ where: { id: body.clientId, tenantId: actor.tenantId } });
      if (!client) throw new DomainError(400, "invalid_target", "Client not found in this tenant.");
    }
    if (body.clientGroupId) {
      const group = await prisma.clientGroup.findFirst({ where: { id: body.clientGroupId, tenantId: actor.tenantId } });
      if (!group) throw new DomainError(400, "invalid_target", "Client group not found in this tenant.");
    }

    const event = await prisma.event.create({
      data: {
        tenantId: actor.tenantId,
        title: body.title,
        description: body.description ?? null,
        type: body.type,
        startAt: new Date(body.startAt),
        endAt: body.endAt ? new Date(body.endAt) : null,
        location: body.location ?? null,
        url: body.url ?? null,
        audience: body.audience,
        clientId: body.audience === "CLIENT" ? body.clientId! : null,
        clientGroupId: body.audience === "GROUP" ? body.clientGroupId! : null,
        recurrence: body.recurrence ?? "NONE",
        recurrenceUntil: body.recurrenceUntil ? new Date(body.recurrenceUntil) : null,
      },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "event.create",
      tenantId: actor.tenantId,
      targetType: "Event",
      targetId: event.id,
      after: { title: event.title } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ event }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
