import { notFound } from "next/navigation";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { toRow } from "@/lib/site/pages";
import { PAGE_TEMPLATES } from "@/lib/site/page-templates";
import { PageHeader, Card } from "@/components/shell";
import { SitePageEditor } from "../site-page-editor";
import { s3Configured, publicUrlForKey } from "@/lib/storage/s3";

export default async function EditSitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_SITE_READ.key);
  const { id } = await params;
  const page = await prisma.sitePage.findFirst({
    where: { id, tenantId: actor.tenantId },
  });
  if (!page) notFound();

  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_SITE_WRITE.key);

  return (
    <div>
      <PageHeader
        title={page.title}
        subtitle="Edit the page HTML, SEO, and publish status."
        backHref="/admin/site/pages"
        backLabel="Site pages"
      />
      <Card>
        <SitePageEditor
          page={toRow(page)}
          canWrite={canWrite}
          initialOgImageUrl={
            page.ogImageKey && s3Configured() ? publicUrlForKey(page.ogImageKey) : null
          }
          templates={PAGE_TEMPLATES.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
          }))}
        />
      </Card>
    </div>
  );
}
