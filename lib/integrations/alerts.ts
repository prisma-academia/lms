import { prisma } from "@/lib/db/client";
import { runWithContext } from "@/lib/db/tenant-context";
import { logger } from "@/lib/logger";
import { safeFetch, SafeFetchError } from "@/lib/integrations/safe-fetch";
import { tenantHttpOrigin } from "@/lib/url/tenant";
import { configOf, markError, markOk, openSecrets } from "@/lib/integrations/store";
import { ALERT_PROVIDERS, isAlertProvider, type AlertProvider } from "@/lib/integrations/registry";
import { describeEvent, formatFor, validateAlertUrl, type AlertContext, type AlertMessage } from "@/lib/integrations/alert-format";
import type { TenantIntegration } from "@/lib/generated/prisma/client";

/**
 * Team alerts: post a short, human message to Slack / Discord / Teams /
 * Google Chat channels that subscribed to an event type.
 *
 * `dispatchAlerts` is called by `emitEvent` (lib/integrations/events.ts) for
 * every event. Contract: it never throws, and a failing channel only records
 * its error on its own row.
 */

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

async function buildContext(tenantId: string, data: Record<string, unknown>): Promise<AlertContext> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } });
  const ctx: AlertContext = {
    academy: tenant?.name ?? "Academy",
    adminOrigin: tenant ? tenantHttpOrigin(tenant.slug) : "",
  };

  // emitEvent may already have attached the learner; otherwise look them up.
  const given = data.learner as { id?: unknown; email?: unknown; firstName?: unknown; lastName?: unknown } | undefined;
  const learnerId = str(given?.id) ?? str(data.learnerId);
  if (learnerId) {
    const l =
      given && str(given.email)
        ? { id: learnerId, email: String(given.email), firstName: str(given.firstName), lastName: str(given.lastName) }
        : await prisma.client.findFirst({ where: { id: learnerId, tenantId }, select: { id: true, email: true, firstName: true, lastName: true } });
    if (l) ctx.learner = { id: l.id, email: l.email, name: [l.firstName, l.lastName].filter(Boolean).join(" ") || l.email };
  }

  const courseId = str(data.courseId);
  if (courseId) {
    const c = await prisma.course.findFirst({ where: { id: courseId, tenantId }, select: { id: true, title: true } });
    if (c) ctx.course = c;
  }

  let examId = str(data.examId);
  const attemptId = str(data.attemptId);
  if (attemptId && (!examId || !ctx.learner)) {
    const a = await prisma.examAttempt.findFirst({
      where: { id: attemptId, tenantId },
      select: { examId: true, candidate: { select: { fullName: true } } },
    });
    if (a) {
      examId = examId ?? a.examId;
      ctx.candidateName = a.candidate.fullName;
    }
  }
  if (examId) {
    const e = await prisma.exam.findFirst({ where: { id: examId, tenantId }, select: { id: true, title: true } });
    if (e) ctx.exam = e;
  }
  return ctx;
}

/** Post one message to one channel. Returns an error message, or null on success. */
export async function postAlert(provider: AlertProvider, webhookUrl: string, message: AlertMessage): Promise<string | null> {
  const checked = validateAlertUrl(provider, webhookUrl);
  if (!checked.ok) return checked.message;
  try {
    const res = await safeFetch(
      checked.url,
      {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8", "user-agent": "PrismaLMS-Alerts/1.0" },
        body: JSON.stringify(formatFor(provider, message)),
      },
      { timeoutMs: 8000, maxBytes: 8 * 1024 }
    );
    if (res.status >= 200 && res.status < 300) return null;
    return `The channel answered ${res.status}${res.body ? `: ${res.body.slice(0, 160)}` : ""}`;
  } catch (err) {
    if (err instanceof SafeFetchError) return err.message;
    return err instanceof Error ? err.message.slice(0, 200) : "Could not reach the channel.";
  }
}

async function sendToChannel(row: TenantIntegration, message: AlertMessage): Promise<string | null> {
  if (!isAlertProvider(row.provider)) return "Not an alert channel.";
  let url: string | undefined;
  try {
    url = openSecrets(row).webhookUrl;
  } catch {
    return "The saved webhook URL could not be decrypted. Paste it again.";
  }
  if (!url) return "No webhook URL saved.";
  const error = await postAlert(row.provider, url, message);
  if (error) await markError(row.id, error);
  else await markOk(row.id);
  return error;
}

/** "Send test" from the admin: always posts, whatever events the channel picked. */
export async function sendTestAlert(row: TenantIntegration): Promise<string | null> {
  const ctx = await buildContext(row.tenantId, {});
  return sendToChannel(row, describeEvent("ping", {}, ctx));
}

export async function dispatchAlerts(tenantId: string, type: string, data: Record<string, unknown>): Promise<void> {
  try {
    await runWithContext({ mode: "tenant-admin", tenantId }, async () => {
      const rows = await prisma.tenantIntegration.findMany({
        where: { tenantId, provider: { in: [...ALERT_PROVIDERS] }, status: { in: ["CONNECTED", "ERROR"] } },
      });
      const subscribed = rows.filter((r) => {
        const events = configOf(r).events;
        return Array.isArray(events) && (events.includes(type) || events.includes("*"));
      });
      if (subscribed.length === 0) return;
      const ctx = await buildContext(tenantId, data);
      const message = describeEvent(type, data, ctx);
      await Promise.all(
        subscribed.map((r) =>
          sendToChannel(r, message).catch((err) => {
            logger.warn({ err, integrationId: r.id }, "alert_send_failed");
            return null;
          })
        )
      );
    });
  } catch (err) {
    logger.error({ err, tenantId, type }, "alert_dispatch_failed");
  }
}
