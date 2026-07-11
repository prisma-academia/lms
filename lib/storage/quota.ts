import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { formatBytes } from "@/lib/tenant/plan";

export async function getTenantStorage(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { storageUsedBytes: true, storageQuotaBytes: true },
  });
  if (!tenant) throw new DomainError(404, "not_found", "Tenant not found.");
  return tenant;
}

export async function assertStorageQuota(tenantId: string, contentLength: number): Promise<void> {
  if (contentLength <= 0) {
    throw new DomainError(400, "invalid_size", "File size must be positive.");
  }
  const { storageUsedBytes, storageQuotaBytes } = await getTenantStorage(tenantId);
  const next = storageUsedBytes + BigInt(contentLength);
  if (next > storageQuotaBytes) {
    throw new DomainError(
      413,
      "quota_exceeded",
      `Storage quota exceeded (${formatBytes(storageUsedBytes)} of ${formatBytes(storageQuotaBytes)} used). Upgrade your plan for more storage.`
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

export function validateTenantAssetKey(tenantId: string, key: string): boolean {
  return key.startsWith(`tenants/${tenantId}/`);
}
