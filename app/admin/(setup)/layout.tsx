import { requireTenantPage } from "@/lib/auth/page-guards";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  await requireTenantPage(undefined, { skipOnboardingGate: true });
  return <div className="min-h-screen bg-stone-50 p-8">{children}</div>;
}
