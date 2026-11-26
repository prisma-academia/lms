"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TenantMark } from "@/components/tenant-mark";
import { Icon, type IconName } from "@/components/icon";
import { LogoutButton } from "@/components/logout-button";
import { NotificationBell } from "@/components/notification-bell";
import { GroupedNav } from "@/components/nav-links";
import { activeNavHref, flattenNav, type NavEntry, type NavItem } from "@/components/nav-model";
import { PageFinderButton, PageFinderProvider } from "@/components/command-palette";
import { MAIN_CONTENT_ID, SHELL_STICKY_TOP, SkipLink } from "@/components/skip-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ThemeMode } from "@/lib/theme/cookie";
import { cn } from "@/lib/utils";

type Tab = NavItem & { icon: IconName };

const HOME: Tab = { href: "/dashboard", label: "Home", icon: "grid" };
const COURSES: Tab = { href: "/my-courses", label: "Courses", icon: "book" };
const TASKS: Tab = { href: "/assignments", label: "Assignments", icon: "clipboard" };
const GRADES: Tab = { href: "/grades", label: "Grades", icon: "award" };

/**
 * The four places a learner goes most. On a phone these are the tab bar; the
 * rest sits one tap away under "More". Five tabs left no room for it, and the
 * fifth (Profile) is not somewhere anyone goes daily.
 */
const PRIMARY_TABS: Tab[] = [HOME, COURSES, TASKS, GRADES];

const MY_LEARNING: Tab[] = [
  { href: "/certificates", label: "Certificates", icon: "award" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
];
const EXPLORE: Tab[] = [
  { href: "/courses", label: "Catalog", icon: "search" },
  { href: "/programmes", label: "Programmes", icon: "route" },
  { href: "/library", label: "Library", icon: "layers" },
];
const YOU: Tab[] = [
  { href: "/profile", label: "Profile", icon: "user" },
  { href: "/inbox", label: "Inbox", icon: "mail" },
  { href: "/notifications", label: "Notifications", icon: "bell" },
];

/** Everything, grouped — the desktop sidebar. */
const SIDEBAR_NAV: NavEntry[] = [
  HOME,
  { id: "learning", label: "My learning", items: [COURSES, TASKS, GRADES, ...MY_LEARNING] },
  { id: "explore", label: "Explore", items: EXPLORE },
  { id: "you", label: "You", items: YOU },
];

/** What the tab bar does not show — the "More" sheet. */
const MORE_NAV: NavEntry[] = [
  { id: "learning", label: "My learning", items: MY_LEARNING },
  { id: "explore", label: "Explore", items: EXPLORE },
  { id: "you", label: "You", items: YOU },
];

const ALL_ITEMS = flattenNav(SIDEBAR_NAV);

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  // A course page belongs to "my courses"; the catalogue is only its own index.
  if (href === "/my-courses")
    return pathname === "/my-courses" || pathname.startsWith("/courses/");
  if (href === "/courses") return pathname === "/courses";
  return pathname === href || pathname.startsWith(href + "/");
}

const TAB_CLASS =
  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold outline-none [touch-action:manipulation] transition-colors focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring";

function TabIcon({ name, active }: { name: IconName; active: boolean }) {
  return (
    <span
      className={cn(
        "flex size-8 items-center justify-center rounded-[10px] border-2 transition-colors",
        active ? "border-foreground bg-primary text-primary-foreground shadow-sm" : "border-transparent"
      )}
    >
      <Icon name={name} className="size-[18px]" />
    </span>
  );
}

export function StudentShell({
  title,
  logoUrl,
  userLabel,
  avatarUrl,
  themeMode,
  children,
}: {
  title: string;
  logoUrl?: string | null;
  userLabel: string;
  /** The learner's profile photo, when they have one. */
  avatarUrl?: string | null;
  themeMode: ThemeMode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  // Held here so the "More" sheet reopens showing the mode last chosen.
  const [mode, setMode] = useState<ThemeMode>(themeMode);

  const current = activeNavHref(pathname, ALL_ITEMS, isActive);
  const onPrimaryTab = PRIMARY_TABS.some((tab) => tab.href === current);

  return (
    <PageFinderProvider items={ALL_ITEMS}>
      <SkipLink />
      <div className={cn("flex min-h-[100dvh] flex-col lg:flex-row", SHELL_STICKY_TOP)}>
        {/* Desktop sidebar */}
        <aside
          aria-label="Sidebar"
          className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r-2 border-border bg-card px-4 py-5 lg:flex print:hidden"
        >
          <Link
            href="/dashboard"
            className="mb-4 flex shrink-0 items-center gap-3 rounded-[10px] px-1 py-1 outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <TenantMark logoUrl={logoUrl} name={title} className="size-10 rounded-[12px] text-lg" />
            <span className="min-w-0">
              <span className="block truncate font-heading text-[15px] leading-tight">{title}</span>
              <span className="block text-[11.5px] font-bold text-muted-foreground">Student portal</span>
            </span>
          </Link>

          <PageFinderButton className="mb-4 w-full shrink-0" />

          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2">
            <GroupedNav entries={SIDEBAR_NAV} isActive={isActive} />
          </div>

          <div className="shrink-0 pt-4">
            <div className="mb-3 flex items-center gap-2.5 border-t-2 border-dashed border-border pt-4">
              <Link
                href="/profile"
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Avatar label={userLabel} src={avatarUrl} />
                <span className="min-w-0 truncate text-[13px] font-bold text-card-foreground">{userLabel}</span>
              </Link>
              <NotificationBell />
            </div>
            <div className="flex items-center justify-between gap-2">
              <ThemeToggle initialMode={mode} onChange={setMode} />
              <LogoutButton endpoint="/api/auth/logout" postLogoutPath="/auth/login" logoutContext="client" />
            </div>
          </div>
        </aside>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b-2 border-border bg-card px-3 py-2 lg:hidden print:hidden">
          <Link
            href="/dashboard"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <TenantMark logoUrl={logoUrl} name={title} className="size-9 text-[15px]" iconClassName="size-[18px]" />
            <span className="min-w-0 truncate font-heading text-base">{title}</span>
          </Link>
          <PageFinderButton compact className="shrink-0" />
          <NotificationBell className="size-11" />
          <Link
            href="/profile"
            aria-label="Your profile"
            className="flex size-11 shrink-0 items-center justify-center rounded-full outline-none [touch-action:manipulation] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Avatar label={userLabel} src={avatarUrl} />
          </Link>
        </header>

        {/* Main content. `main > div` stays the page's direct wrapper: a page
            that needs more width asks for it with `data-wide-page`, and the rule
            in globals.css matches on exactly this structure. The bottom padding
            keeps the last of the page clear of the tab bar and the home
            indicator below it. */}
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-5 outline-none sm:px-6 lg:px-10 lg:py-8 print:p-0"
        >
          <div className="mx-auto w-full max-w-4xl print:max-w-none">{children}</div>
        </main>

        {/* Mobile bottom tab bar */}
        <nav
          aria-label="Primary"
          className="safe-b fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-2 border-border bg-card lg:hidden print:hidden"
        >
          {PRIMARY_TABS.map((tab) => {
            const active = tab.href === current;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(TAB_CLASS, active ? "text-card-foreground" : "text-muted-foreground")}
              >
                <TabIcon name={tab.icon} active={active} />
                {tab.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            // Marked as where you are when the page is one of the ones it holds.
            className={cn(TAB_CLASS, !onPrimaryTab ? "text-card-foreground" : "text-muted-foreground")}
          >
            <TabIcon name="more-horizontal" active={!onPrimaryTab} />
            More
          </button>
        </nav>

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="bottom" className="lg:hidden">
            <SheetHeader>
              <SheetTitle>More</SheetTitle>
              <SheetDescription className="truncate">{userLabel}</SheetDescription>
            </SheetHeader>
            <SheetBody className="px-3">
              <GroupedNav
                entries={MORE_NAV}
                isActive={isActive}
                label="More pages"
                onNavigate={() => setMoreOpen(false)}
              />
            </SheetBody>
            <SheetFooter className="flex items-center justify-between gap-3">
              <ThemeToggle initialMode={mode} onChange={setMode} size="md" />
              <LogoutButton
                endpoint="/api/auth/logout"
                postLogoutPath="/auth/login"
                logoutContext="client"
                size="lg"
              />
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </PageFinderProvider>
  );
}
