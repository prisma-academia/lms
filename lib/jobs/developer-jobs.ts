import { rawPrisma } from "@/lib/db/raw-client";

/**
 * Housekeeping for the Developer API (run by `scripts/jobs.ts prune-api-logs`,
 * daily). Cross-tenant by nature, so the raw client.
 *
 *  - request logs older than 30 days;
 *  - per-minute usage buckets older than 2 days (rate limiting needs only the
 *    current minute); per-day buckets older than 400 days;
 *  - idempotency records past their 24-hour life;
 *  - used or expired login links older than a day;
 *  - webhook events older than 30 days (their deliveries cascade).
 */
export async function pruneDeveloperData(now = new Date()): Promise<Record<string, number>> {
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const [logs, minutes, daysRows, idem, links, events] = await Promise.all([
    rawPrisma.apiRequestLog.deleteMany({ where: { createdAt: { lt: days(30) } } }),
    rawPrisma.apiUsage.deleteMany({ where: { period: "MINUTE", bucket: { lt: days(2) } } }),
    rawPrisma.apiUsage.deleteMany({ where: { period: "DAY", bucket: { lt: days(400) } } }),
    rawPrisma.apiIdempotency.deleteMany({ where: { expiresAt: { lt: now } } }),
    rawPrisma.loginLinkToken.deleteMany({ where: { OR: [{ consumedAt: { lt: days(1) } }, { expiresAt: { lt: days(1) } }] } }),
    rawPrisma.webhookEvent.deleteMany({ where: { createdAt: { lt: days(30) } } }),
  ]);
  return {
    requestLogs: logs.count,
    minuteBuckets: minutes.count,
    dayBuckets: daysRows.count,
    idempotency: idem.count,
    loginLinks: links.count,
    webhookEvents: events.count,
  };
}
