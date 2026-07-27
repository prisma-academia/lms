import { notFound } from "next/navigation";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { renderTenantSitePage } from "@/lib/site/render-page";
import {
  buildTenantMetadata,
  loadTenantBranding,
  requestOrigin,
} from "@/lib/site/metadata";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";

export async function generateMetadata() {
  const branding = await loadTenantBranding();
  const origin = await requestOrigin();
  if (!branding) return {};
  const rendered = await renderTenantSitePage({
    tenantId: (await requireExistingTenant()).tenant!.id,
    slug: null,
  });
  const ogImageUrl =
    rendered?.page.ogImageKey && s3Configured()
      ? publicUrlForKey(rendered.page.ogImageKey)
      : null;
  return buildTenantMetadata(origin, branding, "public", {
    title: rendered?.page.seoTitle,
    description: rendered?.page.seoDescription,
    ogImageUrl,
  });
}

export default async function TenantLandingPage() {
  const page = await requireExistingTenant();
  const rendered = await renderTenantSitePage({
    tenantId: page.tenant!.id,
    slug: null,
  });
  if (!rendered) notFound();
  return rendered.element;
}
