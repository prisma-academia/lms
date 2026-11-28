import { prisma } from "@/lib/db/client";
import { runWithContext } from "@/lib/db/tenant-context";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/lib/generated/prisma/client";
import { attemptDelivery } from "./webhook-delivery";

/**
 * `emitEvent(tenantId, type, data)` — tell an academy's webhook subscribers
 * that something happened.
 *
 * Contract with callers: it NEVER throws and never slows the caller down
 * meaningfully. Inside a request the whole thing runs in `after()`, once the
 * response has gone; outside one (jobs, scripts) it runs inline. A webhook
 * problem can therefore never fail a lesson completion, a payment or a submit.
 *
 * Writes the event (only when some active endpoint subscribes to it — no
 * subscribers, no outbox row), one delivery per subscribed endpoint, and makes
 * the first attempt immediately. The `deliver-webhooks` job retries the rest.
 *
 * `learnerId` enriches the payload with the learner's id, email, name and
 * externalId — looked up only when someone is listening.
 */

export type EmitOptions = {
  learnerId?: string | null;
  /**
   * Send at most once per value of this payload field (e.g. "attemptId"), for
   * callers that are themselves idempotent and run more than once.
   */
  oncePer?: string;
};

async function emitNow(tenantId: string, type: string, data: Record<string, unknown>, opts: EmitOptions): Promise<void> {
  await runWithContext({ mode: "tenant-admin", tenantId }, async () => {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { tenantId, status: "ACTIVE", OR: [{ events: { has: type } }, { events: { has: "*" } }] },
      select: { id: true },
    });
    if (endpoints.length === 0) return;

    if (opts.oncePer) {
      const value = data[opts.oncePer];
      if (typeof value === "string") {
        const sent = await prisma.webhookEvent.findFirst({
          where: { tenantId, type, payloadJson: { path: [opts.oncePer], equals: value } },
          select: { id: true },
        });
        if (sent) return;
      }
    }

    let payload: Record<string, unknown> = data;
    if (opts.learnerId) {
      const learner = await prisma.client.findFirst({
        where: { id: opts.learnerId, tenantId },
        select: { id: true, email: true, firstName: true, lastName: true, externalId: true },
      });
      if (learner) payload = { ...data, learner };
    }

    const event = await prisma.webhookEvent.create({
      data: { tenantId, type, payloadJson: payload as Prisma.InputJsonValue },
      select: { id: true },
    });
    await prisma.webhookDelivery.createMany({
      data: endpoints.map((ep) => ({ tenantId, eventId: event.id, endpointId: ep.id })),
    });
    const deliveries = await prisma.webhookDelivery.findMany({ where: { eventId: event.id }, select: { id: true } });
    await Promise.all(
      deliveries.map((d) =>
        attemptDelivery(d.id).catch((err) => logger.warn({ err, deliveryId: d.id }, "webhook_first_attempt_failed"))
      )
    );
  });
}

export async function emitEvent(
  tenantId: string,
  type: string,
  data: Record<string, unknown>,
  opts: EmitOptions = {}
): Promise<void> {
  const work = async () => {
    // Team alerts (Slack, Discord, Teams, Google Chat) first: they do not
    // depend on there being any webhook endpoint. Never throws.
    try {
      const { dispatchAlerts } = await import("@/lib/integrations/alerts");
      await dispatchAlerts(tenantId, type, data);
    } catch (err) {
      logger.error({ err, tenantId, type }, "alert_dispatch_failed");
    }
    try {
      await emitNow(tenantId, type, data, opts);
    } catch (err) {
      logger.error({ err, tenantId, type }, "webhook_emit_failed");
    }
  };
  try {
    let after: ((fn: () => Promise<void>) => void) | null = null;
    try {
      ({ after } = await import("next/server"));
    } catch {
      after = null;
    }
    if (after) {
      try {
        after(work);
        return;
      } catch {
        // Outside a request scope: fall through and run inline.
      }
    }
    await work();
  } catch (err) {
    logger.error({ err, tenantId, type }, "webhook_emit_schedule_failed");
  }
}
