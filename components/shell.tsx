import type { ReactNode } from "react";
import Link from "next/link";
import type { LogoutContext } from "./logout-button";
import { GroupedNav } from "./nav-links";
import { MobileNav } from "./mobile-nav";
import { flattenNav, pruneNav, type NavEntry, type NavGroup, type NavItem } from "@/components/nav-model";
import { Breadcrumbs, PageTitle } from "@/components/breadcrumbs";
import { PageFinderButton, PageFinderProvider, type FinderItem } from "@/components/command-palette";
import { MAIN_CONTENT_ID, SHELL_STICKY_TOP, SkipLink } from "@/components/skip-link";
import { UserMenu } from "@/components/user-menu";
import { TenantMark } from "@/components/tenant-mark";
import { Icon } from "@/components/icon";
import type { ThemeMode } from "@/lib/theme/cookie";
import { cn } from "@/lib/utils";

export type { NavEntry, NavGroup, NavItem };

function Brand({
  title,
  subtitle,
  logoUrl,
  href,
}: {
  title: string;
  subtitle?: string | null;
  logoUrl?: string | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="mb-5 flex items-center gap-3 rounded-[10px] px-1 py-1 outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <TenantMark logoUrl={logoUrl} name={title} className="size-10 text-lg" />
      <span className="min-w-0">
        <span className="block truncate font-heading text-[15px] leading-tight">{title}</span>
        {subtitle ? (
          <span className="block truncate text-[11.5px] font-bold text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * The staff shell: admin and platform.
 *
 *   sidebar (desktop)  |  top bar: where you are · find a page · account
 *                      |  the page
 *
 * On a phone the sidebar becomes a drawer opened from the top bar.
 *
 * `main > div` is deliberately the direct wrapper of the page: a page that
 * needs more than the reading width asks for it with `data-wide-page` (see the
 * rule at the end of globals.css), and that rule matches on this structure.
 */
export function AppShell({
  title,
  subtitle,
  logoUrl,
  themeMode,
  nav,
  userLabel,
  userDetail,
  homeHref,
  navStorageKey,
  finderExtras = [],
  logoutEndpoint,
  logoutRedirect,
  logoutContext = "client",
  children,
}: {
  title: string;
  /** A line under the title in the sidebar, e.g. "Admin". */
  subtitle?: string | null;
  logoUrl?: string | null;
  themeMode: ThemeMode;
  /** Links and groups of links. A plain list of links still works. */
  nav: NavEntry[];
  userLabel: string;
  /** Shown under the name in the account menu: a role, or an email. */
  userDetail?: string | null;
  /** Where the logo goes. Defaults to the first link in the navigation. */
  homeHref?: string;
  /** Set to let people fold navigation groups; the choice is remembered under this key. */
  navStorageKey?: string;
  /** More things the page finder should offer, beyond the navigation itself. */
  finderExtras?: FinderItem[];
  logoutEndpoint: string;
  logoutRedirect: string;
  logoutContext?: LogoutContext;
  children: ReactNode;
}) {
  const entries = pruneNav(nav);
  const destinations = flattenNav(entries);
  const home = homeHref ?? destinations[0]?.href ?? "/";
  const finderItems: FinderItem[] = [...destinations, ...finderExtras];

  const account = (
    <UserMenu
      label={userLabel}
      detail={userDetail}
      themeMode={themeMode}
      logoutEndpoint={logoutEndpoint}
      logoutRedirect={logoutRedirect}
      logoutContext={logoutContext}
    />
  );

  return (
    <PageFinderProvider items={finderItems}>
      <SkipLink />
      <div className={cn("flex min-h-[100dvh] flex-col lg:flex-row", SHELL_STICKY_TOP)}>
        <aside
          aria-label="Sidebar"
          className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col border-r-2 border-border bg-card px-4 py-5 lg:flex print:hidden"
        >
          <div className="shrink-0">
            <Brand title={title} subtitle={subtitle} logoUrl={logoUrl} href={home} />
          </div>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2">
            <GroupedNav entries={entries} storageKey={navStorageKey} />
          </div>
        </aside>

        <MobileNav
          title={title}
          subtitle={subtitle}
          logoUrl={logoUrl}
          homeHref={home}
          nav={entries}
          navStorageKey={navStorageKey}
          account={account}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Not sticky on purpose: a bar pinned over the page would cover
              whatever the keyboard scrolls to the top edge. Ctrl+K reaches the
              finder from anywhere, and the sidebar never leaves. */}
          <header className="hidden border-b-2 border-border bg-card px-10 py-2.5 lg:block print:hidden">
            <div className="mx-auto flex w-full max-w-6xl items-center gap-4">
              <Breadcrumbs items={destinations} className="flex-1" />
              <PageFinderButton className="w-60 shrink-0" />
              {account}
            </div>
          </header>

          <main
            id={MAIN_CONTENT_ID}
            tabIndex={-1}
            className="min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-8 print:p-0"
          >
            <div className="mx-auto w-full max-w-6xl print:max-w-none">{children}</div>
          </main>
        </div>
      </div>
    </PageFinderProvider>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  backHref,
  backLabel = "Back",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** When set, renders a "← {backLabel}" link above the title. */
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-6">
      {/* Tells the shell what this page is called, for the breadcrumb. */}
      <PageTitle title={title} />
      {backHref ? (
        <Link
          href={backHref}
          className="-ml-1 mb-2 inline-flex min-h-9 items-center gap-1.5 rounded-[8px] px-1 text-[13px] font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden"
        >
          <Icon name="arrow-left" className="size-4" />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-balance break-words font-heading text-2xl leading-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-1 max-w-prose text-sm font-medium text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0 print:hidden">{action}</div> : null}
      </div>
    </div>
  );
}

export function Card({
  children,
  className,
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border-2 border-border bg-card p-5 shadow-md",
        className
      )}
      style={accent ? { boxShadow: `5px 5px 0 ${accent}` } : undefined}
    >
      {children}
    </div>
  );
}
