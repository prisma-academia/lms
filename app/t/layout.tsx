import type { Metadata, Viewport } from "next";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import {
  buildTenantMetadata,
  buildTenantViewport,
  loadTenantBranding,
  requestOrigin,
} from "@/lib/site/metadata";

/**
 * Tenant public landing. Centralizes host→tenant resolution and lifecycle
 * checks before the branded home page renders.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [origin, branding] = await Promise.all([
    requestOrigin(),
    loadTenantBranding(),
  ]);
  if (!branding) return {};
  return buildTenantMetadata(origin, branding, "public");
}

export async function generateViewport(): Promise<Viewport> {
  const branding = await loadTenantBranding();
  if (!branding) return {};
  return buildTenantViewport(branding.settings);
}

export default async function TenantLandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireExistingTenant();
  return <>{children}</>;
}
