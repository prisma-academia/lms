import { requireTenantPage } from "@/lib/auth/page-guards";
import { LogoutButton } from "@/components/logout-button";
import { Icon } from "@/components/icon";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  await requireTenantPage(undefined, { skipOnboardingGate: true });
  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      <header className="flex items-center justify-between gap-4 border-b-2 border-ink bg-card px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span
            className="flex size-9 -rotate-3 items-center justify-center rounded-[10px] border-2 border-ink text-ink shadow-brutal-sm"
            style={{ background: "var(--yellow)" }}
          >
            <Icon name="cap" className="size-5" />
          </span>
          <span className="font-heading text-[15px] leading-tight">Set up your academy</span>
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
