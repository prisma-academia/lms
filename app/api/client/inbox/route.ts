import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

export async function GET() {
  try {
    const actor = await requireClientActor();
    const receipts = await prisma.messageRecipient.findMany({
      where: { clientId: actor.clientId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { message: { select: { subject: true, body: true, category: true, createdAt: true } } },
    });
    const unreadCount = receipts.filter((r) => r.readAt === null).length;
    return ok({ receipts, unreadCount });
  } catch (e) {
    return handleError(e);
  }
}

const ReadBody = z.object({ recipientId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { recipientId } = ReadBody.parse(await request.json());
    const receipt = await prisma.messageRecipient.findFirst({
      where: { id: recipientId, clientId: actor.clientId },
    });
    if (!receipt) throw new DomainError(404, "not_found", "Message not found.");
    if (!receipt.readAt) {
      await prisma.messageRecipient.update({ where: { id: recipientId }, data: { readAt: new Date() } });
    }
    return ok({ read: true });
  } catch (e) {
    return handleError(e);
  }
}
