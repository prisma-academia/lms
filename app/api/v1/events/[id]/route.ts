import { prisma } from "@/lib/db/client";
import { syncLiveSessionMeeting } from "@/lib/integrations/meetings";
import { apiRoute } from "@/lib/api/v1/route";
import { audit } from "@/lib/auth/audit";
import { DomainError } from "@/lib/api/errors";
import { EventPatch } from "@/lib/api/v1/schemas";
import * as out from "@/lib/api/v1/serialize";
import { checkAudience, eventData } from "@/lib/api/v1/events";

async function load(tenantId: string, id: string) {
  const e = await prisma.event.findFirst({ where: { id, tenantId } });
  if (!e) throw new DomainError(404, "not_found", "Event not found.");
  return e;
}

/** GET /api/v1/events/{id} */
export const GET = apiRoute<{ id: string }>({ scope: "events:read" }, async (ctx) => {
  return { data: out.calendarEvent(await load(ctx.tenantId, ctx.params.id)) };
});

/** PATCH /api/v1/events/{id} */
export const PATCH = apiRoute<{ id: string }>({ scope: "events:write" }, async (ctx) => {
  const body = ctx.json(EventPatch);
  const before = await load(ctx.tenantId, ctx.params.id);
  await checkAudience(ctx.tenantId, {
    audience: body.audience ?? before.audience,
    learnerId: body.learnerId !== undefined ? body.learnerId : before.clientId,
    groupId: body.groupId !== undefined ? body.groupId : before.clientGroupId,
  });
  const event = await prisma.event.update({ where: { id: before.id }, data: eventData(body) });
  const joinUrl = await syncLiveSessionMeeting(ctx.tenantId, event.id);
  if (joinUrl) event.url = joinUrl;
  await audit({ ...ctx.auditActor, action: "event.update", targetType: "Event", targetId: event.id, before: { title: before.title, startAt: before.startAt }, after: { title: event.title, startAt: event.startAt } });
  return { data: out.calendarEvent(event) };
});

/** DELETE /api/v1/events/{id} */
export const DELETE = apiRoute<{ id: string }>({ scope: "events:write" }, async (ctx) => {
  const before = await load(ctx.tenantId, ctx.params.id);
  await prisma.event.delete({ where: { id: before.id } });
  await audit({ ...ctx.auditActor, action: "event.delete", targetType: "Event", targetId: before.id, before: { title: before.title } });
  return { data: { id: before.id, deleted: true } };
});
