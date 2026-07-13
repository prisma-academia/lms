import type { Metadata, Viewport } from "next";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import {
  buildTenantMetadata,
  buildTenantViewport,
  loadTenantBranding,
  requestOrigin,
} from "@/lib/site/metadata";

/**
 * Client-area layout. Centralizes host→tenant resolution and enforces the
 * tenant lifecycle: a nonexistent tenant 404s, a suspended/archived tenant
 * shows the maintenance screen for all client routes (PRD §13). Session
 * redirects are enforced per-page via `requireClientPage()`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [origin, branding] = await Promise.all([
    requestOrigin(),
    loadTenantBranding(),
  ]);
  if (!branding) return {};
  return buildTenantMetadata(origin, branding, "learner");
}

export async function generateViewport(): Promise<Viewport> {
  const branding = await loadTenantBranding();
  if (!branding) return {};
  return buildTenantViewport(branding.settings);
}

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireExistingTenant();
  return <>{children}</>;
}
