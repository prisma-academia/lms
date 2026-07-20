import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { formatBytes } from "@/lib/tenant/plan";

/**
 * Tenant storage accounting.
 *
 * Two counters:
 *   storageUsedBytes     bytes committed to objects that exist
 *   storageReservedBytes bytes promised to in-flight multipart uploads
 *
 * Both count against the quota. Without the reservation, N concurrent uploads
 * each pass the quota check independently and together blow straight past it.
 *
 * Reservations drift when a browser dies mid-upload, so the reconcile job
 * recomputes storageReservedBytes from live sessions rather than trusting the
 * incremental deltas here. See lib/jobs/reconcile-storage.ts.
 */

export async function getTenantStorage(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { storageUsedBytes: true, storageQuotaBytes: true, storageReservedBytes: true },
  });
  if (!tenant) throw new DomainError(404, "not_found", "Tenant not found.");
  return tenant;
}

/** Bytes still available to the tenant, never negative. */
export async function getAvailableBytes(tenantId: string): Promise<bigint> {
  const { storageUsedBytes, storageQuotaBytes, storageReservedBytes } = await getTenantStorage(tenantId);
  const free = storageQuotaBytes - storageUsedBytes - storageReservedBytes;
  return free > BigInt(0) ? free : BigInt(0);
}

export async function assertStorageQuota(tenantId: string, contentLength: number): Promise<void> {
  if (contentLength <= 0) {
    throw new DomainError(400, "invalid_size", "File size must be positive.");
  }
  const { storageUsedBytes, storageQuotaBytes, storageReservedBytes } = await getTenantStorage(tenantId);
  const next = storageUsedBytes + storageReservedBytes + BigInt(contentLength);
  if (next > storageQuotaBytes) {
    const committed = storageUsedBytes + storageReservedBytes;
    throw new DomainError(
      413,
      "quota_exceeded",
      `Storage quota exceeded (${formatBytes(committed)} of ${formatBytes(storageQuotaBytes)} used). Upgrade your plan for more storage.`
    );
  }
}

export async function recordStorageDelta(tenantId: string, deltaBytes: bigint): Promise<void> {
  if (deltaBytes === BigInt(0)) return;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { storageUsedBytes: { increment: deltaBytes } },
  });
}

/** Hold quota for an upload that has started but not landed. */
export async function reserveStorage(tenantId: string, bytes: bigint): Promise<void> {
  if (bytes <= BigInt(0)) return;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { storageReservedBytes: { increment: bytes } },
  });
}

/** Give back a reservation whose upload was aborted or expired. */
export async function releaseStorageReservation(tenantId: string, bytes: bigint): Promise<void> {
  if (bytes <= BigInt(0)) return;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { storageReservedBytes: { decrement: bytes } },
  });
  await clampReservation(tenantId);
}

/**
 * Convert a reservation into real usage. One update so a crash between the two
 * counters cannot double-count. `actualBytes` comes from HeadObject, not from
 * the client, and generally differs from what was reserved.
 */
export async function settleStorageReservation(
  tenantId: string,
  reservedBytes: bigint,
  actualBytes: bigint
): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      storageReservedBytes: { decrement: reservedBytes },
      storageUsedBytes: { increment: actualBytes },
    },
  });
  await clampReservation(tenantId);
}

/**
 * Floor the reservation at zero. Double-releases (an abort racing an expiry
 * sweep) would otherwise drive it negative and hand the tenant free quota.
 */
async function clampReservation(tenantId: string): Promise<void> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { storageReservedBytes: true },
  });
  if (t && t.storageReservedBytes < BigInt(0)) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { storageReservedBytes: BigInt(0) },
    });
  }
}

export function validateTenantAssetKey(tenantId: string, key: string): boolean {
  return key.startsWith(`tenants/${tenantId}/`);
}
