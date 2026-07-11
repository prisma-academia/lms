import { requireExistingTenant } from "@/lib/auth/tenant-page";

/**
 * Tenant public landing. Centralizes host→tenant resolution and lifecycle
 * checks before the branded home page renders.
 */
export default async function TenantLandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireExistingTenant();
  return <>{children}</>;
}
