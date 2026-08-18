import { notFound } from "next/navigation";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { renderTenantSitePage } from "@/lib/site/render-page";
import {
  buildTenantMetadata,
  loadTenantBranding,
  requestOrigin,
} from "@/lib/site/metadata";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";
import { isReservedSlug } from "@/lib/site/pages";

/** See the note in app/t/page.tsx — pages can render per-viewer progress. */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  if (isReservedSlug(slug)) return {};
  const branding = await loadTenantBranding();
  const origin = await requestOrigin();
  if (!branding) return {};
  const tenant = await requireExistingTenant();
  const rendered = await renderTenantSitePage({
    tenantId: tenant.tenant!.id,
    slug,
  });
  if (!rendered) return {};
  const ogImageUrl =
    rendered.page.ogImageKey && s3Configured()
      ? publicUrlForKey(rendered.page.ogImageKey)
      : null;
  return buildTenantMetadata(origin, branding, "public", {
    title: rendered.page.seoTitle || rendered.headTitle || rendered.page.title,
    description: rendered.page.seoDescription || rendered.headDescription,
    ogImageUrl,
  });
}

export default async function TenantCmsPage({ params }: Params) {
  const { slug } = await params;
  if (!slug || isReservedSlug(slug)) notFound();
  const page = await requireExistingTenant();
  const rendered = await renderTenantSitePage({
    tenantId: page.tenant!.id,
    slug,
  });
  if (!rendered) notFound();
  return rendered.element;
}
