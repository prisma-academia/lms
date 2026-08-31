import { prisma } from "@/lib/db/client";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { brandingAssetUrls } from "@/lib/tenant/branding-assets";

/**
 * The tenant's mark, name and colour, for a certificate.
 *
 * Deliberately keyed on an explicit `tenantId` rather than reusing
 * `loadTenantBranding`, which resolves the tenant from the request host. A
 * certificate is rendered from both the admin app and the learner app, and the
 * one thing that must never happen is a certificate carrying the wrong
 * organisation's logo because host resolution disagreed with the record.
 */
export async function certificateBranding(tenantId: string): Promise<{
  name: string;
  logoUrl: string | null;
  primaryColor: string;
}> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, settingsJson: true },
  });
  const settings = parseTenantSettings(tenant?.settingsJson);
  return {
    name: tenant?.name ?? "",
    logoUrl: brandingAssetUrls(settings).logoUrl,
    primaryColor: settings.primaryColor,
  };
}
