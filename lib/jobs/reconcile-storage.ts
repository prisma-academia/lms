import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { rawPrisma as prisma } from "@/lib/db/raw-client";
import { env } from "@/lib/env";
import { s3Configured, abortMultipartUpload, listMultipartUploads } from "@/lib/storage/s3";
import { logger } from "@/lib/logger";

/**
 * Storage reconciliation. Runs outside any request, so it uses rawPrisma.
 *
 * Three sweeps:
 *  1. storageUsedBytes  <- actual sum of objects under the tenant prefix.
 *  2. Expire stale upload sessions and abort their S3 multipart uploads,
 *     including orphans S3 knows about but the database does not.
 *  3. storageReservedBytes <- recomputed from live sessions. This is the source
 *     of truth for the reservation, not the incremental deltas, because a
 *     browser that dies mid-upload never releases its own reservation.
 */

function getS3(): S3Client | null {
  if (!s3Configured() || !env.S3_BUCKET) return null;
  return new S3Client({
    region: env.S3_REGION ?? "us-east-1",
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    forcePathStyle: env.S3_ENDPOINT ? env.S3_FORCE_PATH_STYLE !== false : false,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
  });
}

/** Orphaned S3 multipart uploads older than this are aborted. */
const ORPHAN_MULTIPART_AGE_MS = 24 * 60 * 60 * 1000;

export async function reconcileStorage(): Promise<number> {
  const s3 = getS3();
  if (!s3 || !env.S3_BUCKET) return 0;

  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let updated = 0;

  for (const tenant of tenants) {
    const prefix = `tenants/${tenant.id}/`;

    // --- 1. Actual object usage -------------------------------------------
    // ListObjectsV2 does NOT count in-flight multipart parts, which is exactly
    // what we want: those are covered by the reservation, not by used bytes.
    let total = BigInt(0);
    let token: string | undefined;
    do {
      const list = await s3.send(
        new ListObjectsV2Command({
          Bucket: env.S3_BUCKET,
          Prefix: prefix,
          ContinuationToken: token,
        })
      );
      for (const obj of list.Contents ?? []) {
        if (obj.Size != null) total += BigInt(obj.Size);
      }
      token = list.NextContinuationToken;
    } while (token);

    // --- 2. Expire stale sessions, abort orphaned multipart uploads --------
    const now = new Date();
    const stale = await prisma.libraryUpload.findMany({
      where: { tenantId: tenant.id, status: "PENDING", expiresAt: { lt: now } },
      select: { id: true, key: true, uploadId: true },
    });
    for (const s of stale) {
      try {
        await abortMultipartUpload({ key: s.key, uploadId: s.uploadId });
      } catch (e) {
        // Already gone is fine — the point is that it stops occupying storage.
        logger.warn({ err: e, key: s.key }, "reconcile: abort of stale upload failed");
      }
      await prisma.libraryUpload.update({ where: { id: s.id }, data: { status: "EXPIRED" } });
    }

    try {
      const live = await listMultipartUploads(prefix);
      if (live.length > 0) {
        const known = await prisma.libraryUpload.findMany({
          where: { tenantId: tenant.id, status: "PENDING" },
          select: { uploadId: true },
        });
        const knownIds = new Set(known.map((k) => k.uploadId));
        for (const u of live) {
          if (knownIds.has(u.uploadId)) continue;
          const age = u.initiated ? now.getTime() - u.initiated.getTime() : Infinity;
          if (age < ORPHAN_MULTIPART_AGE_MS) continue;
          try {
            await abortMultipartUpload({ key: u.key, uploadId: u.uploadId });
          } catch (e) {
            logger.warn({ err: e, key: u.key }, "reconcile: abort of orphan upload failed");
          }
        }
      }
    } catch (e) {
      // Some S3-compatible backends do not implement ListMultipartUploads.
      // Session expiry above still bounds the damage, so this is not fatal.
      logger.warn({ err: e, tenantId: tenant.id }, "reconcile: ListMultipartUploads unavailable");
    }

    // --- 3. Reservation from live sessions ---------------------------------
    // The FULL declared size stays reserved for the whole session, not the
    // not-yet-uploaded remainder: multipart parts are invisible to
    // ListObjectsV2 until the upload completes, so bytes already sent are in
    // neither counter. Reserving only the remainder would let a tenant
    // overshoot the quota by however much is mid-flight.
    const pending = await prisma.libraryUpload.findMany({
      where: { tenantId: tenant.id, status: "PENDING" },
      select: { declaredBytes: true },
    });
    let reserved = BigInt(0);
    for (const p of pending) reserved += p.declaredBytes;

    const current = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { storageUsedBytes: true, storageReservedBytes: true },
    });
    if (
      current &&
      (current.storageUsedBytes !== total || current.storageReservedBytes !== reserved)
    ) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { storageUsedBytes: total, storageReservedBytes: reserved },
      });
      updated++;
    }
  }
  return updated;
}

/**
 * Prune finished upload sessions. Parts cascade with the session, so this also
 * bounds LibraryUploadPart, which would otherwise grow without limit.
 */
export async function pruneUploadSessions(olderThanDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const res = await prisma.libraryUpload.deleteMany({
    where: { status: { in: ["COMPLETED", "ABORTED", "EXPIRED"] }, updatedAt: { lt: cutoff } },
  });
  return res.count;
}
