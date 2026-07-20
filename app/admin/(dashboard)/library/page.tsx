import { Suspense } from "react";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { s3Configured } from "@/lib/storage/s3";
import { PageHeader } from "@/components/shell";
import { Spinner } from "@/components/spinner";
import { LibraryClient } from "./library-client";

/**
 * Items are NOT fetched here. The previous version pulled 500 rows and signed a
 * download URL for every one on each render, then shipped 500 expiring URLs in
 * the HTML. The client now pages through /api/tenant/library and gets
 * thumbnails from a stable redirect route instead.
 */
export default async function LibraryPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_LIBRARY_READ.key);

  const [folders, tags, tenant, totalCount, unfiledCount] = await Promise.all([
    prisma.libraryFolder.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, parentId: true, _count: { select: { items: true } } },
    }),
    prisma.libraryTag.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { storageUsedBytes: true, storageReservedBytes: true, storageQuotaBytes: true },
    }),
    prisma.libraryItem.count({ where: { tenantId: actor.tenantId } }),
    prisma.libraryItem.count({ where: { tenantId: actor.tenantId, folderId: null } }),
  ]);

  return (
    <div>
      <PageHeader title="Library" subtitle="Upload, organise and share media with your learners." />
      {/* useSearchParams needs a Suspense boundary in the App Router. */}
      <Suspense fallback={<div className="flex justify-center py-10"><Spinner /></div>}>
        <LibraryClient
          folders={folders.map((f) => ({
            id: f.id,
            name: f.name,
            parentId: f.parentId,
            count: f._count.items,
          }))}
          tags={tags}
          storage={{
            used: Number(tenant?.storageUsedBytes ?? 0),
            reserved: Number(tenant?.storageReservedBytes ?? 0),
            quota: Number(tenant?.storageQuotaBytes ?? 0),
          }}
          storageConfigured={s3Configured()}
          canWrite={hasPermission(actor, PERMISSIONS.TENANT_LIBRARY_WRITE.key)}
          canAssign={hasPermission(actor, PERMISSIONS.TENANT_LIBRARY_ASSIGN.key)}
          totalCount={totalCount}
          unfiledCount={unfiledCount}
        />
      </Suspense>
    </div>
  );
}
