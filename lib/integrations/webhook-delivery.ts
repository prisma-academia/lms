import { prisma } from "@/lib/db/client";
import { rawPrisma } from "@/lib/db/raw-client";
import { runWithContext } from "@/lib/db/tenant-context";
import { logger } from "@/lib/logger";
import { openSecret } from "@/lib/crypto/secret-box";
import { safeFetch, SafeFetchError, type SafeFetchOptions } from "./safe-fetch";
import { DELIVERY_HEADER, EVENT_HEADER, SIGNATURE_HEADER, signatureHeader } from "./webhook-signing";

/**
 * Sending one webhook delivery, and what a result does to the delivery and its
 * endpoint. Retries back off 1m, 5m, 30m, 2h, 6h, 12h, 24h; after the eighth
 * failed attempt the delivery is DEAD. An endpoint that has failed without a
 * single success for 3 days is switched off and the academy owner is emailed.
 */

export const SECRET_AAD = "webhook-endpoint";
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000, 12 * 3600_000, 24 * 3600_000];
export const AUTO_DISABLE_AFTER_MS = 3 * 24 * 3600_000;
const LEASE_MS = 60_000;
const RESPONSE_KEEP = 2048;

/** Delay before the next attempt after `attemptsMade` failures, or null = give up. */
export function nextRetryDelay(attemptsMade: number): number | null {
  return attemptsMade >= 1 && attemptsMade <= RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[attemptsMade - 1] : null;
}

/** The exact bytes that are signed and sent. Built from the stored event, so every retry is identical. */
export function eventBody(event: { id: string; type: string; createdAt: Date; tenantId: string; payloadJson: unknown }): string {
  return JSON.stringify({
    id: event.id,
    type: event.type,
    createdAt: event.createdAt.toISOString(),
    tenantId: event.tenantId,
    data: event.payloadJson ?? {},
  });
}

export type SendResult = {
  ok: boolean;
  status: number | null;
  responseBody: string | null;
  durationMs: number;
  error: string | null;
  requestHeaders: Record<string, string>;
};

/** Sign and POST. Never throws: every failure is a result. */
export async function sendWebhook(input: {
  url: string;
  secrets: string[];
  eventType: string;
  deliveryId: string;
  body: string;
  fetchOptions?: SafeFetchOptions;
  nowSec?: number;
}): Promise<SendResult> {
  const t = input.nowSec ?? Math.floor(Date.now() / 1000);
  const requestHeaders: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "PrismaLMS-Webhooks/1.0",
    [EVENT_HEADER]: input.eventType,
    [DELIVERY_HEADER]: input.deliveryId,
    [SIGNATURE_HEADER]: signatureHeader(input.secrets, t, input.body),
  };
  const started = Date.now();
  try {
    const res = await safeFetch(input.url, { method: "POST", headers: requestHeaders, body: input.body }, input.fetchOptions);
    const ok = res.status >= 200 && res.status < 300;
    return {
      ok,
      status: res.status,
      responseBody: res.body.slice(0, RESPONSE_KEEP),
      durationMs: res.durationMs,
      error: ok ? null : `Endpoint answered ${res.status}.`,
      requestHeaders,
    };
  } catch (err) {
    const message = err instanceof SafeFetchError ? err.message : err instanceof Error ? err.message.slice(0, 300) : "Delivery failed.";
    return { ok: false, status: null, responseBody: null, durationMs: Date.now() - started, error: message, requestHeaders };
  }
}

function liveSecrets(ep: { secretEnc: string; previousSecretEnc: string | null; previousSecretExpiresAt: Date | null }, now: Date): string[] {
  const secrets = [openSecret(ep.secretEnc, SECRET_AAD)];
  if (ep.previousSecretEnc && ep.previousSecretExpiresAt && ep.previousSecretExpiresAt > now) {
    try {
      secrets.push(openSecret(ep.previousSecretEnc, SECRET_AAD));
    } catch (err) {
      logger.warn({ err }, "webhook_previous_secret_unreadable");
    }
  }
  return secrets;
}

async function notifyOwnerOfDisable(tenantId: string, endpointUrl: string): Promise<void> {
  try {
    const tenant = await rawPrisma.tenant.findUnique({ where: { id: tenantId }, select: { ownerUserId: true } });
    const owner = tenant?.ownerUserId
      ? await prisma.tenantUser.findFirst({ where: { id: tenant.ownerUserId, tenantId }, select: { email: true, firstName: true } })
      : await prisma.tenantUser.findFirst({ where: { tenantId, isOwner: true }, select: { email: true, firstName: true } });
    if (!owner) return;
    const [{ sendEmail }, { notificationEmail }, { loadTenantBrandingById }] = await Promise.all([
      import("@/lib/email/send"),
      import("@/lib/email/templates"),
      import("@/lib/email/branding"),
    ]);
    const branding = await loadTenantBrandingById(tenantId);
    const subject = "A webhook endpoint was switched off";
    await sendEmail({
      to: owner.email,
      subject,
      replyTo: branding.supportEmail,
      fromName: branding.name,
      html: notificationEmail(branding, {
        name: owner.firstName,
        subject,
        body:
          `Webhook deliveries to ${endpointUrl} have failed for three days without a single success, so the endpoint has been disabled.\n\n` +
          `No further events will be sent to it. Fix the receiving server, then re-enable the endpoint and redeliver missed events from Developers → Webhooks.`,
        actionUrl: `${branding.appOrigin}/admin/developers?tab=webhooks`,
      }),
    });
  } catch (err) {
    logger.error({ err, tenantId }, "webhook_disable_email_failed");
  }
}

/**
 * Attempt one delivery. Must run inside the delivery's tenant context. Claims
 * a short lease first, so the inline first attempt and the sweeper never send
 * the same delivery twice at once. Returns the send result, or null if the
 * delivery was not attemptable (already done, or claimed elsewhere).
 */
export async function attemptDelivery(deliveryId: string, opts: { fetchOptions?: SafeFetchOptions; force?: boolean } = {}): Promise<SendResult | null> {
  const now = new Date();
  const claimed = await prisma.webhookDelivery.updateMany({
    where: {
      id: deliveryId,
      status: { in: opts.force ? ["PENDING", "FAILED", "DEAD"] : ["PENDING", "FAILED"] },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { lockedUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (claimed.count !== 1) return null;

  const delivery = await prisma.webhookDelivery.findFirst({ where: { id: deliveryId }, include: { event: true, endpoint: true } });
  if (!delivery) return null;
  const { endpoint, event } = delivery;

  if (endpoint.status !== "ACTIVE") {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "DEAD", lockedUntil: null, nextAttemptAt: null, errorMessage: "Endpoint is disabled." },
    });
    return null;
  }

  let secrets: string[];
  try {
    secrets = liveSecrets(endpoint, now);
  } catch (err) {
    logger.error({ err, endpointId: endpoint.id }, "webhook_secret_unreadable");
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { lockedUntil: null, errorMessage: "Signing secret could not be decrypted (APP_ENCRYPTION_KEY missing or changed)." },
    });
    return null;
  }

  const result = await sendWebhook({
    url: endpoint.url,
    secrets,
    eventType: event.type,
    deliveryId: delivery.id,
    body: eventBody(event),
    fetchOptions: opts.fetchOptions,
  });

  const attempts = delivery.attempt + 1;
  const delay = result.ok ? null : nextRetryDelay(attempts);
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      attempt: attempts,
      status: result.ok ? "SUCCEEDED" : delay === null ? "DEAD" : "FAILED",
      nextAttemptAt: result.ok || delay === null ? null : new Date(Date.now() + delay),
      lockedUntil: null,
      lastAttemptAt: now,
      responseStatus: result.status,
      responseBody: result.responseBody,
      errorMessage: result.error,
      durationMs: result.durationMs,
      requestHeadersJson: { ...result.requestHeaders, [SIGNATURE_HEADER]: result.requestHeaders[SIGNATURE_HEADER].replace(/v1=[0-9a-f]+/g, "v1=…") },
    },
  });

  // Test pings count towards endpoint health like any delivery: the same
  // server answers both.
  if (result.ok) {
    await prisma.webhookEndpoint.updateMany({
      where: { id: endpoint.id },
      data: { consecutiveFailures: 0, failingSince: null, lastSuccessAt: now },
    });
  } else {
    const failingSince = endpoint.failingSince ?? now;
    const disable = now.getTime() - failingSince.getTime() >= AUTO_DISABLE_AFTER_MS;
    const updated = await prisma.webhookEndpoint.updateMany({
      where: { id: endpoint.id, status: "ACTIVE" },
      data: {
        consecutiveFailures: { increment: 1 },
        failingSince,
        lastFailureAt: now,
        ...(disable
          ? { status: "DISABLED", disabledAt: now, disabledReason: "Failed continuously for 3 days." }
          : {}),
      },
    });
    if (disable && updated.count === 1) {
      logger.warn({ endpointId: endpoint.id, tenantId: endpoint.tenantId }, "webhook_endpoint_auto_disabled");
      await notifyOwnerOfDisable(endpoint.tenantId, endpoint.url);
    }
  }
  return result;
}

/** The `deliver-webhooks` job: every due delivery, across academies. */
export async function sweepDueDeliveries(limit = 200): Promise<{ attempted: number; succeeded: number }> {
  const now = new Date();
  const due = await rawPrisma.webhookDelivery.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      nextAttemptAt: { lte: now },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true, tenantId: true },
  });
  let attempted = 0;
  let succeeded = 0;
  for (const d of due) {
    try {
      const r = await runWithContext({ mode: "tenant-admin", tenantId: d.tenantId }, () => attemptDelivery(d.id));
      if (r) {
        attempted++;
        if (r.ok) succeeded++;
      }
    } catch (err) {
      logger.error({ err, deliveryId: d.id }, "webhook_sweep_attempt_failed");
    }
  }
  return { attempted, succeeded };
}
