import type { ReactNode } from "react";
import Link from "next/link";
import { LogoutButton, type LogoutContext } from "./logout-button";
import { NavLinks, type NavItem } from "./nav-links";
import { MobileNav } from "./mobile-nav";
import { Icon } from "@/components/icon";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ThemeMode } from "@/lib/theme/cookie";
import { cn } from "@/lib/utils";

export type { NavItem };

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Brand({
  title,
  logoUrl,
}: {
  title: string;
  logoUrl?: string | null;
}) {
  return (
    <div className="mb-6 flex items-center gap-3 px-1">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="size-10 shrink-0 rounded-[10px] border-2 border-border object-contain"
        />
      ) : (
        <div
          className="flex size-10 shrink-0 -rotate-3 items-center justify-center rounded-[10px] border-2 border-foreground bg-primary font-heading text-lg text-primary-foreground shadow-sm"
        >
          {title.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate font-heading text-[15px] leading-tight">
          {title}
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  title,
  logoUrl,
  themeMode,
  nav,
  userLabel,
  logoutEndpoint,
  logoutRedirect,
  logoutContext = "client",
  children,
}: {
  title: string;
  logoUrl?: string | null;
  themeMode: ThemeMode;
  nav: NavItem[];
  userLabel: string;
  logoutEndpoint: string;
  logoutRedirect: string;
  logoutContext?: LogoutContext;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col lg:flex-row">
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col border-r-2 border-border bg-card px-4 py-6 lg:flex">
        <div className="shrink-0">
          <Brand title={title} logoUrl={logoUrl} />
        </div>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <NavLinks items={nav} />
        </div>
        <div className="shrink-0 pt-6">
          <div className="mb-3 flex items-center gap-2.5 border-t-2 border-dashed border-border pt-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary text-[12px] font-bold text-primary-foreground">
              {initials(userLabel)}
            </span>
            <div className="min-w-0 truncate text-[13px] font-bold text-card-foreground">
              {userLabel}
            </div>
          </div>
          <div className="mb-3">
            <ThemeToggle initialMode={themeMode} />
          </div>
          <LogoutButton
            endpoint={logoutEndpoint}
            postLogoutPath={logoutRedirect}
            logoutContext={logoutContext}
          />
        </div>
      </aside>

      <MobileNav
        title={title}
        nav={nav}
        userLabel={userLabel}
        logoutEndpoint={logoutEndpoint}
        logoutRedirect={logoutRedirect}
        logoutContext={logoutContext}
      />

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
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
      {backHref ? (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-muted-foreground hover:text-foreground"
        >
          <Icon name="arrow-left" className="size-4" />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl leading-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
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
