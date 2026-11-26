import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { defaultFooterHtml, defaultHeaderHtml } from "@/lib/site/kind-starters";
import { aiStatus } from "@/lib/ai/config";
import { PageHeader, Card } from "@/components/shell";
import { LayoutEditor } from "./layout-editor";

/**
 * The site's header, footer and shared styles.
 *
 * (The folder is called `layout` because that is its address, /admin/site/layout.
 * It is an ordinary page, not a Next.js layout file.)
 */
export default async function SiteLayoutPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_SITE_READ.key);
  const layout = await prisma.siteLayout.findUnique({ where: { tenantId: actor.tenantId } });

  return (
    <div>
      <PageHeader
        title="Header and footer"
        subtitle="What appears above and below every page of your site."
        backHref="/admin/site/pages"
        backLabel="Site pages"
      />
      <Card>
        <LayoutEditor
          initial={{
            headerHtml: layout?.headerHtml ?? "",
            footerHtml: layout?.footerHtml ?? "",
            sharedCss: layout?.sharedCss ?? "",
          }}
          defaults={{ headerHtml: defaultHeaderHtml(), footerHtml: defaultFooterHtml() }}
          canWrite={hasPermission(actor, PERMISSIONS.TENANT_SITE_WRITE.key)}
          aiConfigured={aiStatus().configured}
        />
      </Card>
    </div>
  );
}
