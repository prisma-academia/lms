import { notFound } from "next/navigation";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { renderTenantSitePage } from "@/lib/site/render-page";
import { PreviewBanner } from "@/components/preview-banner";

/**
 * A site page rendered exactly as a visitor would receive it, including drafts.
 *
 * This lives under `/admin/preview/...` rather than in the dashboard route group
 * on purpose: the whole point is to show the public page WITHOUT the admin
 * sidebar, header and container widths around it. It is the same
 * `renderTenantSitePage` the public routes call, so what shows here is the page
 * itself and not a second implementation that can drift away from it.
 *
 * It is admin-only. `/admin/*` is session-gated by the proxy, and TENANT_SITE_READ
 * is enforced below — which is what makes it safe to render unpublished pages.
 */
export const dynamic = "force-dynamic";

export default async function SitePagePreview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_SITE_READ.key);
  const { id } = await params;

  const rendered = await renderTenantSitePage({
    tenantId: actor.tenantId,
    slug: null,
    pageId: id,
  });
  if (!rendered) notFound();

  const status = rendered.page.status === "PUBLISHED" ? "published" : "draft";

  return (
    <>
      <PreviewBanner
        label={
          status === "published"
            ? "Preview — this page is live"
            : "Preview — this page is a draft and is not visible to visitors"
        }
        tone={status === "published" ? "info" : "warning"}
      />
      {rendered.element}
    </>
  );
}
