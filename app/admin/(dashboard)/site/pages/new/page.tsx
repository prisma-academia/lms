import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { PAGE_TEMPLATES } from "@/lib/site/page-templates";
import { PageHeader, Card } from "@/components/shell";
import { SitePageEditor } from "../site-page-editor";
import { redirect } from "next/navigation";

export default async function NewSitePage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_SITE_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_SITE_WRITE.key);
  if (!canWrite) redirect("/admin/site/pages");

  return (
    <div>
      <PageHeader
        title="New page"
        subtitle="Create a public page for your landing site."
        backHref="/admin/site/pages"
        backLabel="Site pages"
      />
      <Card>
        <SitePageEditor
          page={null}
          canWrite
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
