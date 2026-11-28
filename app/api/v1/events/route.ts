import { prisma } from "@/lib/db/client";
import { syncLiveSessionMeeting } from "@/lib/integrations/meetings";
import { apiRoute } from "@/lib/api/v1/route";
import { audit } from "@/lib/auth/audit";
import { EventCreate, EventListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";
import { checkAudience, eventData } from "@/lib/api/v1/events";
import { emitEvent } from "@/lib/integrations/events";

/** GET /api/v1/events — calendar events and live classes. */
export const GET = apiRoute({ scope: "events:read" }, async (ctx) => {
  const q = ctx.query(EventListQuery);
  const rows = await prisma.event.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...sinceFilter(q, "updatedAt"),
      ...(q.type ? { type: q.type } : {}),
      ...(q.from || q.to ? { startAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
    },
    ...pageArgs(q, "updatedAt"),
  });
  return page(rows, q, out.calendarEvent);
});

/** POST /api/v1/events */
export const POST = apiRoute({ scope: "events:write" }, async (ctx) => {
  const body = ctx.json(EventCreate);
  await checkAudience(ctx.tenantId, { audience: body.audience, learnerId: body.learnerId ?? null, groupId: body.groupId ?? null });
  const event = await prisma.event.create({
    data: { tenantId: ctx.tenantId, title: body.title, type: body.type, startAt: new Date(body.startAt), ...eventData(body) },
  });
  await audit({ ...ctx.auditActor, action: "event.create", targetType: "Event", targetId: event.id, after: { title: event.title, startAt: event.startAt } });
  // A live session without a link gets a Zoom / Meet meeting when the academy turned that on.
  const joinUrl = await syncLiveSessionMeeting(ctx.tenantId, event.id);
  if (joinUrl) event.url = joinUrl;
  await emitEvent(ctx.tenantId, "event.created", { eventId: event.id, title: event.title, type: event.type, startAt: event.startAt.toISOString(), url: event.url });
  return { data: out.calendarEvent(event), status: 201 };
});
