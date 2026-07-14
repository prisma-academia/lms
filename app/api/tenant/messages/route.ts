import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";
import { sendEmail } from "@/lib/email/send";
import { notificationEmail } from "@/lib/email/templates";
import { loadTenantBrandingById } from "@/lib/email/branding";
import { logger } from "@/lib/logger";

const CreateBody = z
  .object({
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(10000),
    category: z.enum(["MESSAGE", "ANNOUNCEMENT", "REMINDER"]).optional(),
    audience: z.enum(["ALL", "CLIENT", "GROUP"]),
    clientId: z.string().min(1).nullable().optional(),
    clientGroupId: z.string().min(1).nullable().optional(),
  })
  .refine(
    (b) =>
      (b.audience === "ALL" && !b.clientId && !b.clientGroupId) ||
      (b.audience === "CLIENT" && b.clientId && !b.clientGroupId) ||
      (b.audience === "GROUP" && b.clientGroupId && !b.clientId),
    { message: "Audience target does not match the selected audience.", path: ["audience"] }
  );

type Recip = { id: string; email: string; firstName: string | null; lastName: string | null };

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_MESSAGES_READ.key);
    const { cursor, take } = parsePagination(new URL(request.url).searchParams);
    const rows = await prisma.message.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { _count: { select: { recipients: true } } },
    });
    return ok(rows, buildPageMeta(rows, take));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_MESSAGES_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);
    const category = body.category ?? "MESSAGE";

    // Resolve recipient clients.
    let recipients: Recip[];
    if (body.audience === "ALL") {
      recipients = await prisma.client.findMany({ select: { id: true, email: true, firstName: true, lastName: true } });
    } else if (body.audience === "CLIENT") {
      recipients = await prisma.client.findMany({
        where: { id: body.clientId! },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      if (recipients.length === 0) throw new DomainError(400, "invalid_target", "Client not found.");
    } else {
      const group = await prisma.clientGroup.findFirst({ where: { id: body.clientGroupId! } });
      if (!group) throw new DomainError(400, "invalid_target", "Client group not found.");
      const members = await prisma.clientGroupMembership.findMany({
        where: { groupId: body.clientGroupId! },
        include: { client: { select: { id: true, email: true, firstName: true, lastName: true } } },
      });
      recipients = members.map((m) => m.client);
    }

    const message = await prisma.message.create({
      data: {
        tenantId: actor.tenantId,
        subject: body.subject,
        body: body.body,
        category,
        senderUserId: actor.userId,
        audience: body.audience,
        clientId: body.audience === "CLIENT" ? body.clientId! : null,
        clientGroupId: body.audience === "GROUP" ? body.clientGroupId! : null,
      },
    });

    if (recipients.length > 0) {
      const ids = recipients.map((r) => r.id);
      const prefs = await prisma.notificationPreference.findMany({
        where: { clientId: { in: ids }, category },
      });
      const prefMap = new Map(prefs.map((p) => [p.clientId, p]));
      const wantsInApp = (cid: string) => prefMap.get(cid)?.inApp ?? true;
      const wantsEmail = (cid: string) => prefMap.get(cid)?.email ?? true;

      await prisma.$transaction([
        prisma.messageRecipient.createMany({
          data: recipients.map((r) => ({ tenantId: actor.tenantId, messageId: message.id, clientId: r.id })),
        }),
        prisma.notification.createMany({
          data: recipients
            .filter((r) => wantsInApp(r.id))
            .map((r) => ({
              tenantId: actor.tenantId,
              clientId: r.id,
              category,
              title: body.subject,
              body: body.body.slice(0, 500),
            })),
        }),
      ]);

      // Email channel — best-effort, don't fail the request on delivery errors.
      const emailTargets = recipients.filter((r) => wantsEmail(r.id));
      const branding = await loadTenantBrandingById(actor.tenantId);
      await Promise.allSettled(
        emailTargets.map((r) =>
          sendEmail({
            to: r.email,
            subject: body.subject,
            replyTo: branding.supportEmail,
            fromName: branding.name,
            html: notificationEmail(branding, {
              name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || null,
              subject: body.subject,
              body: body.body,
            }),
          }).catch((err) => {
            logger.error({ err, to: r.email }, "notification_email_failed");
          })
        )
      );
    }

    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "message.send",
      tenantId: actor.tenantId,
      targetType: "Message",
      targetId: message.id,
      after: { subject: message.subject, recipients: recipients.length } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ message, recipientCount: recipients.length }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
