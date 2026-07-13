import type { Metadata, Viewport } from "next";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import {
  buildTenantMetadata,
  buildTenantViewport,
  loadTenantBranding,
  requestOrigin,
} from "@/lib/site/metadata";

/**
 * Wraps the entire tenant-admin segment (both `admin/auth/*` and
 * `admin/(dashboard)/*`). Enforces that the host resolves to a real,
 * existing tenant before any admin route renders — a nonexistent tenant
 * subdomain 404s here instead of rendering a login form. Session/permission
 * checks happen deeper, in `app/admin/(dashboard)/layout.tsx`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [origin, branding] = await Promise.all([
    requestOrigin(),
    loadTenantBranding(),
  ]);
  if (!branding) return {};
  return buildTenantMetadata(origin, branding, "admin");
}

export async function generateViewport(): Promise<Viewport> {
  const branding = await loadTenantBranding();
  if (!branding) return {};
  return buildTenantViewport(branding.settings);
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireExistingTenant();
  return <>{children}</>;
}
