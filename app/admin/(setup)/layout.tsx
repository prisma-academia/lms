import { requireTenantPage } from "@/lib/auth/page-guards";
import { loadTenantBranding } from "@/lib/site/metadata";
import { LogoutButton } from "@/components/logout-button";
import { TenantMark } from "@/components/tenant-mark";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  await requireTenantPage(undefined, { skipOnboardingGate: true });
  const branding = await loadTenantBranding();
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b-2 border-border bg-card px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <TenantMark
            logoUrl={branding?.logoUrl}
            name={branding?.name}
            className="size-9 text-[15px]"
          />
          <div className="min-w-0">
            {branding?.name ? (
              <>
                <div className="truncate font-heading text-[15px] leading-tight">
                  {branding.name}
                </div>
                <div className="text-[11.5px] font-bold text-muted-foreground">
                  Set up your academy
                </div>
              </>
            ) : (
              <span className="font-heading text-[15px] leading-tight">
                Set up your academy
              </span>
            )}
          </div>
        </div>
        <LogoutButton
          endpoint="/api/auth/logout"
          postLogoutPath="/admin/auth/login"
          logoutContext="tenant-admin"
        />
      </header>
      <main className="flex-1 p-4 sm:p-8">{children}</main>
    </div>
  );
}
