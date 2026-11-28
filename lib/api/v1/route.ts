import { prisma } from "@/lib/db/client";
import { rawPrisma } from "@/lib/db/raw-client";
import { runWithContext } from "@/lib/db/tenant-context";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { createApiRoute, type ApiKeyRecord, type PipelineStore } from "./pipeline";

/**
 * `apiRoute({ scope }, handler)` for app/api/v1/** — the pipeline in
 * ./pipeline.ts wired to Postgres.
 *
 * The key lookup is the one query made through `rawPrisma`: no tenant context
 * exists until we know whose key it is. Everything else goes through the
 * scoped client inside the key's tenant context, with the tenant id also
 * written explicitly.
 */

const LAST_USED_THROTTLE_MS = 60_000;

function inTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return runWithContext({ mode: "tenant-admin", tenantId }, fn) as Promise<T>;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

function dayBucket(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function bump(key: ApiKeyRecord, period: "MINUTE" | "DAY", bucket: Date, isError: boolean): Promise<number> {
  const where = { apiKeyId_period_bucket: { apiKeyId: key.id, period, bucket } };
  const update = { count: { increment: 1 }, ...(isError ? { errorCount: { increment: 1 } } : {}) };
  try {
    const row = await prisma.apiUsage.upsert({
      where,
      create: { tenantId: key.tenantId, apiKeyId: key.id, period, bucket, count: 1, errorCount: isError ? 1 : 0 },
      update,
    });
    return row.count;
  } catch (err) {
    // Two first-requests-of-the-minute raced on the create. The row exists now.
    if (!isUniqueViolation(err)) throw err;
    const row = await prisma.apiUsage.update({ where, data: update });
    return row.count;
  }
}

export const prismaStore: PipelineStore = {
  async findKeyByHash(hash) {
    const row = await rawPrisma.apiKey.findUnique({
      where: { keyHash: hash },
      include: { tenant: { select: { slug: true, status: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantSlug: row.tenant.slug,
      tenantStatus: row.tenant.status,
      name: row.name,
      prefix: row.prefix,
      scopes: row.scopes,
      ipAllowlist: row.ipAllowlist,
      rateLimitPerMin: row.rateLimitPerMin,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      lastUsedAt: row.lastUsedAt,
    };
  },

  hitMinute(key, bucket) {
    return inTenant(key.tenantId, () => bump(key, "MINUTE", bucket, false));
  },

  idempotencyBegin(key, input) {
    return inTenant(key.tenantId, async () => {
      const where = { apiKeyId_key: { apiKeyId: key.id, key: input.idemKey } };
      for (let i = 0; i < 2; i++) {
        // Look first, so an ordinary replay never trips (and logs) a unique violation.
        const seen = await prisma.apiIdempotency.findUnique({ where });
        if (seen && seen.expiresAt.getTime() > Date.now()) {
          if (seen.requestHash !== input.requestHash) return { kind: "mismatch" } as const;
          if (seen.status === null || seen.responseBody === null) return { kind: "in_progress" } as const;
          return { kind: "replay", status: seen.status, body: seen.responseBody } as const;
        }
        if (seen) await prisma.apiIdempotency.deleteMany({ where: { id: seen.id } });
        try {
          await prisma.apiIdempotency.create({
            data: {
              tenantId: key.tenantId,
              apiKeyId: key.id,
              key: input.idemKey,
              method: input.method,
              path: input.path,
              requestHash: input.requestHash,
              expiresAt: input.expiresAt,
            },
          });
          return { kind: "new" } as const;
        } catch (err) {
          // A concurrent first request won the create; the next pass reads its row.
          if (!isUniqueViolation(err)) throw err;
        }
      }
      return { kind: "in_progress" } as const;
    });
  },

  idempotencyFinish(key, idemKey, status, body) {
    return inTenant(key.tenantId, async () => {
      await prisma.apiIdempotency.updateMany({
        where: { apiKeyId: key.id, key: idemKey },
        data: { status, responseBody: body.slice(0, 256 * 1024) },
      });
    });
  },

  idempotencyAbort(key, idemKey) {
    return inTenant(key.tenantId, async () => {
      await prisma.apiIdempotency.deleteMany({ where: { apiKeyId: key.id, key: idemKey } });
    });
  },

  record(key, entry) {
    return inTenant(key.tenantId, async () => {
      await prisma.apiRequestLog.create({
        data: {
          tenantId: key.tenantId,
          apiKeyId: key.id,
          requestId: entry.requestId,
          method: entry.method,
          path: entry.path,
          query: entry.query,
          status: entry.status,
          durationMs: entry.durationMs,
          errorCode: entry.errorCode,
          ip: entry.ip,
          userAgent: entry.userAgent,
        },
      });
      await bump(key, "DAY", dayBucket(new Date()), entry.status >= 400);
      if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
        await prisma.apiKey.updateMany({
          where: { id: key.id, tenantId: key.tenantId },
          data: { lastUsedAt: new Date(), lastUsedIp: entry.ip },
        });
      }
    });
  },
};

/** `after()` inside a request; inline outside one (scripts). */
export async function deferWork(work: () => Promise<void>): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(work);
  } catch {
    await work();
  }
}

export const apiRoute = createApiRoute({
  store: prismaStore,
  defer: deferWork,
  // Upstash, when configured, as a second line. Fails open by design; the DB
  // minute counter above is what actually holds the line.
  extraLimit: (key) =>
    enforceRateLimit(
      { name: `api-key-${key.rateLimitPerMin}`, limit: key.rateLimitPerMin, windowSeconds: 60 },
      [key.id]
    ),
});
