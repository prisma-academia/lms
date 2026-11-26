import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { AppShell, type NavEntry } from "@/components/shell";
import { resolveThemeForRequest } from "@/lib/theme/resolve";

/**
 * Eight destinations: few enough to leave open, so the groups here are plain
 * headings (no `navStorageKey`) rather than something to fold.
 */
const NAV: NavEntry[] = [
  { href: "/dashboard", label: "Overview", icon: "grid", keywords: "home dashboard" },
  { href: "/analytics", label: "Analytics", icon: "chart", keywords: "reports usage metrics" },
  {
    id: "academies",
    label: "Academies",
    items: [
      { href: "/tenants", label: "Tenants", icon: "building", keywords: "academies organisations customers" },
      { href: "/plans", label: "Plans", icon: "credit-card", keywords: "pricing subscriptions billing" },
    ],
  },
  {
    id: "access",
    label: "Access",
    items: [
      { href: "/users", label: "Users", icon: "users", keywords: "platform staff admins" },
      { href: "/role-templates", label: "Roles", icon: "shield", keywords: "permissions" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: "/activity", label: "Activity", icon: "activity", keywords: "audit log history" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
];

/** "Create" shortcuts for the page finder. */
const CREATE = [
  { href: "/tenants/new", label: "New tenant" },
  { href: "/plans/new", label: "New plan" },
  { href: "/users/new", label: "New platform user" },
  { href: "/role-templates/new", label: "New role" },
].map((entry) => ({ ...entry, icon: "plus" as const, group: "Create", keywords: "add create" }));

export default async function PlatformDashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePlatformPage();
  // Platform keeps the default preset (resolveThemeForRequest returns preset:null
  // for non-tenant hosts), but colour mode is per-user everywhere.
  const theme = await resolveThemeForRequest();

  const user = await prisma.platformUser.findUnique({
    where: { id: actor.userId },
    select: { email: true, firstName: true, lastName: true },
  });
  if (!user) redirect("/auth/login");
  const label = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;

  return (
    <AppShell
      title="Platform"
      subtitle="Operator console"
      themeMode={theme.mode}
      nav={NAV}
      homeHref="/dashboard"
      finderExtras={CREATE}
      userLabel={label}
      // The email, unless the name above already is the email.
      userDetail={label === user.email ? null : user.email}
      logoutEndpoint="/api/auth/logout"
      logoutRedirect="/auth/login"
      logoutContext="platform"
    >
      {children}
    </AppShell>
  );
}
