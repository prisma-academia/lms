import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

export async function GET() {
  try {
    const actor = await requireClientActor();
    const notifications = await prisma.notification.findMany({
      where: { clientId: actor.clientId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const unreadCount = notifications.filter((n) => n.readAt === null).length;
    return ok({ notifications, unreadCount });
  } catch (e) {
    return handleError(e);
  }
}

const ReadBody = z.object({ id: z.string().min(1).optional() });

/** Mark one notification read (with id), or all read (no id). */
export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { id } = ReadBody.parse(await request.json().catch(() => ({})));
    if (id) {
      await prisma.notification.updateMany({
        where: { id, clientId: actor.clientId, readAt: null },
        data: { readAt: new Date() },
      });
    } else {
      await prisma.notification.updateMany({
        where: { clientId: actor.clientId, readAt: null },
        data: { readAt: new Date() },
      });
    }
    return ok({ read: true });
  } catch (e) {
    return handleError(e);
  }
}
