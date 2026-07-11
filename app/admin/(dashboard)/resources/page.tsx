import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createPresignedDownload, s3Configured } from "@/lib/storage/s3";
import { PageHeader } from "@/components/shell";
import { ResourceLibrary, type ResourceItem } from "./resource-library";

export default async function ResourcesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_RESOURCES_READ.key);
  const configured = s3Configured();

  const [resources, groups, tags] = await Promise.all([
    prisma.resource.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { group: { select: { name: true } }, tags: { select: { tagId: true } } },
    }),
    prisma.resourceGroup.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.resourceTag.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const items: ResourceItem[] = await Promise.all(
    resources.map(async (r) => {
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
        groupId: r.groupId,
        tagIds: r.tags.map((t) => t.tagId),
        url,
        createdAt: r.createdAt.toISOString(),
      };
    })
  );

  return (
    <div>
      <PageHeader title="Resources" subtitle="Central file library — upload, tag, group, and reuse." />
      <ResourceLibrary
        items={items}
        groups={groups}
        tags={tags}
        storageConfigured={configured}
        canWrite={hasPermission(actor, PERMISSIONS.TENANT_RESOURCES_WRITE.key)}
      />
    </div>
  );
}
