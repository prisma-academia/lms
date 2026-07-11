import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  type: z.enum(["LIVE_SESSION", "DEADLINE", "REMINDER", "ANNOUNCEMENT"]).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  url: z.string().url().max(500).nullable().optional(),
  recurrence: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).optional(),
  recurrenceUntil: z.string().datetime().nullable().optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EVENTS_READ.key);
    const { id } = await ctx.params;
    const event = await prisma.event.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { client: { select: { email: true } }, clientGroup: { select: { name: true } } },
    });
    if (!event) throw new DomainError(404, "not_found", "Event not found.");
    return ok({ event });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EVENTS_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());

    const before = await prisma.event.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!before) throw new DomainError(404, "not_found", "Event not found.");

    const event = await prisma.event.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.startAt !== undefined ? { startAt: new Date(body.startAt) } : {}),
        ...(body.endAt !== undefined ? { endAt: body.endAt ? new Date(body.endAt) : null } : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.url !== undefined ? { url: body.url } : {}),
        ...(body.recurrence !== undefined ? { recurrence: body.recurrence } : {}),
        ...(body.recurrenceUntil !== undefined
          ? { recurrenceUntil: body.recurrenceUntil ? new Date(body.recurrenceUntil) : null }
          : {}),
      },
    });
    return ok({ event });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EVENTS_WRITE.key);
    const { id } = await ctx.params;
    const event = await prisma.event.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!event) throw new DomainError(404, "not_found", "Event not found.");
    await prisma.event.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
