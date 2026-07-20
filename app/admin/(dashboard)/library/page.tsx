import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createPresignedDownload, s3Configured } from "@/lib/storage/s3";
import { PageHeader } from "@/components/shell";
import { LibraryClient, type LibraryItemView } from "./library-client";

export default async function LibraryPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_LIBRARY_READ.key);
  const configured = s3Configured();

  const [rows, folders, tags] = await Promise.all([
    prisma.libraryItem.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { folder: { select: { name: true } }, tags: { select: { tagId: true } } },
    }),
    prisma.libraryFolder.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.libraryTag.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const items: LibraryItemView[] = await Promise.all(
    rows.map(async (r) => {
      let url: string | null = null;
      if (configured) {
        try {
          url = await createPresignedDownload(r.key);
        } catch {
          url = null;
        }
      }
      return {
        id: r.id,
        name: r.name,
        contentType: r.contentType,
        sizeBytes: Number(r.sizeBytes),
        folderId: r.folderId,
        tagIds: r.tags.map((t) => t.tagId),
        url,
        createdAt: r.createdAt.toISOString(),
      };
    })
  );

  return (
    <div>
      <PageHeader title="Library" subtitle="Central media library — upload, tag, organise, and share." />
      <LibraryClient
        items={items}
        groups={folders}
        tags={tags}
        storageConfigured={configured}
        canWrite={hasPermission(actor, PERMISSIONS.TENANT_LIBRARY_WRITE.key)}
      />
    </div>
  );
}
