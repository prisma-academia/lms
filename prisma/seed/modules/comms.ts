import { DAY, type SeedContext } from "../index";
import { MESSAGE_CATALOG, NOTIFICATION_CATALOG } from "../components/catalogs/messages";
import { EVENT_CATALOG } from "../components/catalogs/events";

export async function seedComms(ctx: SeedContext): Promise<void> {
  const { prisma, tenantId, now } = ctx;
  const clientId = ctx.ids.clientId;
  const clientGroupId = ctx.ids.clientGroupId;
  const ownerId = ctx.ids.ownerId;

  for (const e of EVENT_CATALOG) {
    const startAt = new Date(now + e.startInDays * DAY);
    const endAt =
      e.endInHours != null
        ? new Date(startAt.getTime() + e.endInHours * 3600_000)
        : null;
    const recurrenceUntil =
      e.recurrence === "WEEKLY" && e.recurrenceWeeks
        ? new Date(now + e.recurrenceWeeks * 7 * DAY)
        : null;

    await prisma.event.create({
      data: {
        tenantId,
        title: e.title,
        description: e.description,
        type: e.type,
        startAt,
        endAt,
        audience: e.audience,
        clientId: e.audience === "CLIENT" ? clientId : null,
        clientGroupId: e.audience === "GROUP" ? clientGroupId : null,
        recurrence: e.recurrence ?? "NONE",
        recurrenceUntil,
      },
    });
  }

  for (const m of MESSAGE_CATALOG) {
    const message = await prisma.message.create({
      data: {
        tenantId,
        subject: m.subject,
        body: m.body,
        category: m.category,
        senderUserId: ownerId,
        audience: "CLIENT",
        clientId,
      },
    });
    await prisma.messageRecipient.create({
      data: {
        tenantId,
        messageId: message.id,
        clientId,
        readAt: m.read ? new Date(now - m.daysAgo * DAY) : null,
      },
    });
  }

  for (const n of NOTIFICATION_CATALOG) {
    await prisma.notification.create({
      data: {
        tenantId,
        clientId,
        category: n.category,
        title: n.title,
        body: n.body,
        readAt: n.read ? new Date(now - n.daysAgo * DAY) : null,
      },
    });
  }
}
