import { redirect } from "next/navigation";
import { resolveThemeForRequest } from "@/lib/theme/resolve";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { parseTenantSettings, type ModuleKey } from "@/lib/tenant/settings";
import { AppShell, type NavEntry, type NavItem } from "@/components/shell";
import type { IconName } from "@/components/icon";
import { TrialBanner } from "@/components/trial-banner";
import { UploadProvider } from "@/components/uploads/upload-provider";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";

type AdminLink = {
  href: string;
  /** Key under `nav` in the messages file. */
  key: string;
  /** The module that must be switched on for this academy; null = always shown. */
  module: ModuleKey | null;
  icon: IconName;
  /** Other words people use for this page, so the page finder can match them. */
  keywords?: string;
};

/** Shown on its own, above the groups. */
const OVERVIEW: AdminLink = { href: "/admin/dashboard", key: "overview", module: null, icon: "grid", keywords: "home dashboard" };

/**
 * The admin's destinations, grouped by what they are for rather than listed
 * in the order they were built. Two dozen links in one column is a list to
 * read every time; seven headings is a list to glance at.
 *
 * A link is hidden when its module is switched off for the academy, exactly
 * as before; a group left with no links is not shown at all.
 */
const GROUPS: Array<{ id: string; key: string; links: AdminLink[] }> = [
  {
    id: "people",
    key: "groupPeople",
    links: [
      { href: "/admin/users", key: "users", module: "users", icon: "user", keywords: "staff team instructors admins" },
      { href: "/admin/user-groups", key: "userGroups", module: "groups", icon: "users", keywords: "staff teams" },
      { href: "/admin/clients", key: "learners", module: "clients", icon: "cap", keywords: "students clients" },
      { href: "/admin/client-groups", key: "clientGroups", module: "groups", icon: "layers", keywords: "cohorts classes learner groups" },
    ],
  },
  {
    id: "learning",
    key: "groupLearning",
    links: [
      { href: "/admin/courses", key: "courses", module: "courses", icon: "book", keywords: "lessons modules" },
      { href: "/admin/programmes", key: "programmes", module: "programmes", icon: "route", keywords: "pathways tracks" },
      { href: "/admin/enrollments", key: "enrollments", module: "enrollments", icon: "user-check", keywords: "enrolments enrolled" },
      { href: "/admin/assignments", key: "assignments", module: "assignments", icon: "clipboard", keywords: "tasks submissions homework" },
      { href: "/admin/library", key: "library", module: "library", icon: "folder", keywords: "files media videos documents" },
      { href: "/admin/templates", key: "templates", module: "templates", icon: "file" },
    ],
  },
  {
    id: "assessment",
    key: "groupAssessment",
    links: [
      { href: "/admin/question-banks", key: "questionBanks", module: "quizzes", icon: "help-circle", keywords: "questions" },
      { href: "/admin/quizzes", key: "quizzes", module: "quizzes", icon: "check-circle", keywords: "tests exams attempts marking grading" },
      { href: "/admin/certificates", key: "certificates", module: "certificates", icon: "award", keywords: "awards" },
    ],
  },
  {
    id: "engagement",
    key: "groupEngagement",
    links: [
      { href: "/admin/events", key: "events", module: "events", icon: "calendar", keywords: "events schedule" },
      { href: "/admin/messages", key: "messages", module: "messages", icon: "mail", keywords: "announcements inbox email" },
      { href: "/admin/referrals", key: "referrals", module: "clients", icon: "share", keywords: "referral codes share links" },
    ],
  },
  {
    id: "payments",
    key: "groupPayments",
    links: [
      { href: "/admin/billing", key: "billing", module: "billing", icon: "credit-card", keywords: "subscription plan payout bank" },
      { href: "/admin/course-payments", key: "coursePayments", module: "billing", icon: "receipt", keywords: "sales revenue purchases" },
      { href: "/admin/fees", key: "fees", module: "fees", icon: "wallet", keywords: "invoices tuition" },
    ],
  },
  {
    id: "website",
    key: "groupWebsite",
    links: [
      { href: "/admin/site/pages", key: "sitePages", module: "site", icon: "globe", keywords: "website landing page builder" },
    ],
  },
  {
    id: "system",
    key: "groupSystem",
    links: [
      { href: "/admin/settings", key: "settings", module: null, icon: "settings", keywords: "branding logo theme" },
      { href: "/admin/role-templates", key: "roles", module: "roles", icon: "shield", keywords: "permissions access" },
      { href: "/admin/activity", key: "activity", module: "activity", icon: "activity", keywords: "audit log history" },
    ],
  },
];

/** "Create" shortcuts for the page finder — typing "new course" should just work. */
const CREATE: Array<{ href: string; label: string; module: ModuleKey; icon: IconName }> = [
  { href: "/admin/courses/new", label: "New course", module: "courses", icon: "plus" },
  { href: "/admin/clients/new", label: "New learner", module: "clients", icon: "plus" },
  { href: "/admin/quizzes/new", label: "New quiz", module: "quizzes", icon: "plus" },
  { href: "/admin/question-banks/new", label: "New question bank", module: "quizzes", icon: "plus" },
  { href: "/admin/programmes/new", label: "New programme", module: "programmes", icon: "plus" },
  { href: "/admin/events/new", label: "New event", module: "events", icon: "plus" },
  { href: "/admin/messages/new", label: "New message", module: "messages", icon: "plus" },
  { href: "/admin/certificates/new", label: "New certificate", module: "certificates", icon: "plus" },
  { href: "/admin/fees/new", label: "New fee", module: "fees", icon: "plus" },
  { href: "/admin/users/new", label: "New staff user", module: "users", icon: "plus" },
  { href: "/admin/user-groups/new", label: "New user group", module: "groups", icon: "plus" },
  { href: "/admin/client-groups/new", label: "New client group", module: "groups", icon: "plus" },
  { href: "/admin/site/pages/new", label: "New site page", module: "site", icon: "plus" },
];

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireTenantPage();
  const theme = await resolveThemeForRequest();

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
  const isOn = (module: ModuleKey | null) => module === null || enabled.includes(module);
  const toItem = (link: AdminLink): NavItem => ({
    href: link.href,
    label: tNav(link.key),
    icon: link.icon,
    keywords: link.keywords,
  });
  const nav: NavEntry[] = [
    toItem(OVERVIEW),
    ...GROUPS.map((group) => ({
      id: group.id,
      label: tNav(group.key),
      items: group.links.filter((link) => isOn(link.module)).map(toItem),
    })),
  ];
  const createShortcuts = CREATE.filter((entry) => isOn(entry.module)).map((entry) => ({
    href: entry.href,
    label: entry.label,
    icon: entry.icon,
    group: "Create",
    keywords: "add create",
  }));

  const label = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
  const logoUrl =
    settings.logoKey && s3Configured() ? publicUrlForKey(settings.logoKey) : null;

  return (
    <AppShell
      title={tenant.name}
      subtitle="Admin"
      logoUrl={logoUrl}
      themeMode={theme.mode}
      nav={nav}
      homeHref="/admin/dashboard"
      // Lets staff fold the groups they do not use; remembered per browser.
      navStorageKey="lms:nav:admin"
      finderExtras={createShortcuts}
      userLabel={label}
      userDetail={user.isOwner ? "Owner" : user.email}
      logoutEndpoint="/api/auth/logout"
      logoutRedirect="/admin/auth/login"
      logoutContext="tenant-admin"
    >
      <TrialBanner
        plan={tenant.plan}
        trialEndsAt={tenant.trialEndsAt}
        subscriptionStatus={tenant.subscriptionStatus}
      />
      {/* Owns the upload queue for the whole admin area. Mounted here rather
          than on the library page so uploads survive navigation. */}
      <UploadProvider>{children}</UploadProvider>
    </AppShell>
  );
}
