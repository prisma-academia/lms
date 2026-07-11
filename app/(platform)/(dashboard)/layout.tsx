import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { AppShell, type NavItem } from "@/components/shell";

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/analytics", label: "Analytics" },
  { href: "/tenants", label: "Tenants" },
  { href: "/plans", label: "Plans" },
  { href: "/users", label: "Users" },
  { href: "/role-templates", label: "Roles" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export default async function PlatformDashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePlatformPage();

  const user = await prisma.platformUser.findUnique({
    where: { id: actor.userId },
    select: { email: true, firstName: true, lastName: true },
  });
  if (!user) redirect("/auth/login");
  const label = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;

  return (
    <AppShell
      title="Platform"
      nav={NAV}
      userLabel={label}
      logoutEndpoint="/api/auth/logout"
      logoutRedirect="/auth/login"
      logoutContext="platform"
    >
      {children}
    </AppShell>
  );
}
