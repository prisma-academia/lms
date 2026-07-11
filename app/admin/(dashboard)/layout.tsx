import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { parseTenantSettings, type ModuleKey } from "@/lib/tenant/settings";
import { AppShell, type NavItem } from "@/components/shell";
import { TrialBanner } from "@/components/trial-banner";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";

const NAV: Array<{ href: string; key: string; module: ModuleKey | null }> = [
  { href: "/admin/dashboard", key: "overview", module: null },
  { href: "/admin/users", key: "users", module: "users" },
  { href: "/admin/user-groups", key: "userGroups", module: "groups" },
  { href: "/admin/clients", key: "learners", module: "clients" },
  { href: "/admin/client-groups", key: "clientGroups", module: "groups" },
  { href: "/admin/courses", key: "courses", module: "courses" },
  { href: "/admin/programmes", key: "programmes", module: "programmes" },
  { href: "/admin/assignments", key: "assignments", module: "assignments" },
  { href: "/admin/question-banks", key: "questionBanks", module: "quizzes" },
  { href: "/admin/quizzes", key: "quizzes", module: "quizzes" },
  { href: "/admin/certificates", key: "certificates", module: "certificates" },
  { href: "/admin/events", key: "events", module: "events" },
  { href: "/admin/messages", key: "messages", module: "messages" },
  { href: "/admin/resources", key: "resources", module: "resources" },
  { href: "/admin/enrollments", key: "enrollments", module: "enrollments" },
  { href: "/admin/fees", key: "fees", module: "fees" },
  { href: "/admin/billing", key: "billing", module: "billing" },
  { href: "/admin/course-payments", key: "coursePayments", module: "billing" },
  { href: "/admin/role-templates", key: "roles", module: "roles" },
  { href: "/admin/templates", key: "templates", module: "templates" },
  { href: "/admin/activity", key: "activity", module: "activity" },
  { href: "/admin/settings", key: "settings", module: null },
];

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireTenantPage();

  const user = await prisma.tenantUser.findUnique({
    where: { id: actor.userId },
    select: { email: true, firstName: true, lastName: true, isOwner: true },
  });
  if (!user) redirect("/admin/auth/login");

  const tenant = await prisma.tenant.findUnique({
    where: { id: actor.tenantId },
    select: {
      name: true,
      status: true,
      settingsJson: true,
      plan: true,
      trialEndsAt: true,
      subscriptionStatus: true,
    },
  });
  if (!tenant || tenant.status !== "ACTIVE") redirect("/maintenance");

  // Onboarding gate is enforced by `requireTenantPage` (see page-guards.ts) so
  // it redirects before any child page streams — a layout-level redirect here
  // degrades to a client-side reload loop once streaming has started.
  const settings = parseTenantSettings(tenant.settingsJson);

  const tNav = await getTranslations("nav");
  const enabled = settings.enabledModules;
  const nav: NavItem[] = NAV.filter(
    (n) => n.module === null || enabled.includes(n.module)
  ).map((n) => ({ href: n.href, label: tNav(n.key) }));

  const label = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
  const logoUrl =
    settings.logoKey && s3Configured() ? publicUrlForKey(settings.logoKey) : null;

  return (
    <AppShell
      title={tenant.name}
      logoUrl={logoUrl}
      accentColor={settings.primaryColor}
      nav={nav}
      userLabel={label}
      logoutEndpoint="/api/auth/logout"
      logoutRedirect="/admin/auth/login"
      logoutContext="tenant-admin"
    >
      <TrialBanner
        plan={tenant.plan}
        trialEndsAt={tenant.trialEndsAt}
        subscriptionStatus={tenant.subscriptionStatus}
      />
      {children}
    </AppShell>
  );
}
