"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { LogoutButton } from "@/components/logout-button";
import { NotificationBell } from "@/components/notification-bell";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ThemeMode } from "@/lib/theme/cookie";
import { cn } from "@/lib/utils";

type Tab = NavItem & { icon: IconName };

const PRIMARY_TABS: Tab[] = [
  { href: "/dashboard", label: "Home", icon: "grid" },
  { href: "/my-courses", label: "Courses", icon: "book" },
  { href: "/assignments", label: "Tasks", icon: "clipboard" },
  { href: "/grades", label: "Grades", icon: "award" },
  { href: "/profile", label: "Profile", icon: "user" },
];

const SECONDARY_NAV: Tab[] = [
  { href: "/courses", label: "Catalog", icon: "search" },
  { href: "/programmes", label: "Programmes", icon: "book" },
  { href: "/library", label: "Library", icon: "layers" },
  { href: "/certificates", label: "Certificates", icon: "award" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/inbox", label: "Inbox", icon: "mail" },
  { href: "/notifications", label: "Notifications", icon: "bell" },
];

const SIDEBAR_NAV: Tab[] = [...PRIMARY_TABS, ...SECONDARY_NAV];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/my-courses")
    return pathname === "/my-courses" || pathname.startsWith("/courses/");
  if (href === "/courses") return pathname === "/courses";
  return pathname === href || pathname.startsWith(href + "/");
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function StudentShell({
  title,
  userLabel,
  themeMode,
  children,
}: {
  title: string;
  userLabel: string;
  themeMode: ThemeMode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <div className="flex min-h-[100dvh] flex-col lg:flex-row">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r-2 border-border bg-card px-4 py-6 lg:flex">
          <div className="mb-6 flex shrink-0 items-center gap-3 px-1">
            <span
              className="flex size-10 -rotate-3 items-center justify-center rounded-[12px] border-2 border-foreground bg-primary text-primary-foreground shadow-sm"
            >
              <Icon name="cap" className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-heading text-[15px] leading-tight">
                {title}
              </div>
              <div className="text-[11.5px] font-bold text-muted-foreground">
                Student portal
              </div>
            </div>
          </div>

          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            <NavLinks items={SIDEBAR_NAV} isActive={isActive} />
          </div>

          <div className="shrink-0 pt-6">
            <div className="mb-3 flex items-center gap-2.5 border-t-2 border-dashed border-border pt-4">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary text-[12px] font-bold text-primary-foreground"
              >
                {initials(userLabel)}
              </span>
              <div className="min-w-0 flex-1 truncate text-[13px] font-bold text-card-foreground">
                {userLabel}
              </div>
              <NotificationBell />
            </div>
            <div className="mb-3">

              <ThemeToggle initialMode={themeMode} />

            </div>

            <LogoutButton
              endpoint="/api/auth/logout"
              postLogoutPath="/auth/login"
              logoutContext="client"
            />
          </div>
        </aside>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b-2 border-border bg-card px-3 py-3 sm:gap-3 sm:px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-border bg-card shadow-sm [touch-action:manipulation] active:translate-x-px active:translate-y-px active:shadow-none"
          >
            <Icon name={menuOpen ? "x" : "menu"} className="size-[18px]" />
          </button>
          <span
            className="flex size-9 shrink-0 -rotate-3 items-center justify-center rounded-[10px] border-2 border-foreground bg-primary text-primary-foreground shadow-sm"
          >
            <Icon name="cap" className="size-[18px]" />
          </span>
          <span className="min-w-0 truncate font-heading text-base">{title}</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <NotificationBell />
          </div>
          <Link
            href="/profile"
            aria-label="Profile"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary text-[12px] font-bold text-primary-foreground [touch-action:manipulation]"
          >
            {initials(userLabel)}
          </Link>
        </header>

        {menuOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/50"
              onClick={() => setMenuOpen(false)}
            />
            <div className="safe-b absolute inset-x-0 top-0 max-h-[100dvh] overflow-y-auto border-b-2 border-border bg-card px-4 pb-6 pt-[68px] shadow-md">
              <NavLinks items={SECONDARY_NAV} onNavigate={() => setMenuOpen(false)} />
              <div className="mt-4 border-t-2 border-dashed border-border pt-4">
                <div className="mb-2 truncate text-sm font-bold text-muted-foreground">
                  {userLabel}
                </div>
                <LogoutButton
                  endpoint="/api/auth/logout"
                  postLogoutPath="/auth/login"
                  logoutContext="client"
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto w-full max-w-4xl">{children}</div>
        </main>

        {/* Mobile bottom tab bar */}
        <nav
          aria-label="Primary"
          className="safe-b fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-2 border-border bg-card lg:hidden"
        >
          {PRIMARY_TABS.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold [touch-action:manipulation] transition-colors",
                  active ? "text-card-foreground" : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-[10px] border-2 transition-colors",
                    active
                      ? "border-foreground bg-primary text-primary-foreground shadow-sm"
                      : "border-transparent"
                  )}
                >
                  <Icon name={t.icon} className="size-[18px]" />
                </span>
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
