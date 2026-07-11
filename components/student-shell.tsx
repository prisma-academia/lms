"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { LogoutButton } from "@/components/logout-button";
import { NotificationBell } from "@/components/notification-bell";
import { ToastProvider } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; icon: IconName };

const TABS: Tab[] = [
  { href: "/dashboard", label: "Home", icon: "grid" },
  { href: "/my-courses", label: "Courses", icon: "book" },
  { href: "/assignments", label: "Tasks", icon: "clipboard" },
  { href: "/grades", label: "Grades", icon: "award" },
  { href: "/profile", label: "Profile", icon: "user" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/my-courses")
    return pathname === "/my-courses" || pathname.startsWith("/courses");
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
  accentColor,
  children,
}: {
  title: string;
  userLabel: string;
  accentColor?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const accent = accentColor || "var(--yellow)";

  return (
    <ToastProvider>
      <div className="flex min-h-[100dvh] flex-col lg:flex-row">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r-2 border-ink bg-card px-4 py-6 lg:flex">
          <div className="mb-6 flex items-center gap-3 px-1">
            <span
              className="flex size-10 -rotate-3 items-center justify-center rounded-[12px] border-2 border-ink text-ink shadow-brutal-sm"
              style={{ background: accent }}
            >
              <Icon name="cap" className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-heading text-[15px] leading-tight">
                {title}
              </div>
              <div className="text-[11.5px] font-bold text-ink/60">
                Student portal
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {TABS.map((t) => {
              const active = isActive(pathname, t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] border-2 px-3 py-2.5 text-sm font-bold transition-[transform,box-shadow,background-color]",
                    active
                      ? "border-ink bg-ink text-paper shadow-[3px_3px_0_var(--yellow)]"
                      : "border-transparent text-ink hover:-translate-x-px hover:-translate-y-px hover:border-ink hover:bg-card hover:shadow-brutal-sm"
                  )}
                >
                  <Icon name={t.icon} className="size-[18px]" />
                  {t.label}
                </Link>
              );
            })}
            <Link
              href="/courses"
              className={cn(
                "flex items-center gap-3 rounded-[10px] border-2 px-3 py-2.5 text-sm font-bold transition-[transform,box-shadow,background-color]",
                pathname === "/courses"
                  ? "border-ink bg-ink text-paper shadow-[3px_3px_0_var(--yellow)]"
                  : "border-transparent text-ink hover:-translate-x-px hover:-translate-y-px hover:border-ink hover:bg-card hover:shadow-brutal-sm"
              )}
            >
              <Icon name="search" className="size-[18px]" />
              Catalog
            </Link>
            <Link
              href="/programmes"
              className={cn(
                "flex items-center gap-3 rounded-[10px] border-2 px-3 py-2.5 text-sm font-bold transition-[transform,box-shadow,background-color]",
                pathname === "/programmes"
                  ? "border-ink bg-ink text-paper shadow-[3px_3px_0_var(--yellow)]"
                  : "border-transparent text-ink hover:-translate-x-px hover:-translate-y-px hover:border-ink hover:bg-card hover:shadow-brutal-sm"
              )}
            >
              <Icon name="book" className="size-[18px]" />
              Programmes
            </Link>
            <Link
              href="/certificates"
              className={cn(
                "flex items-center gap-3 rounded-[10px] border-2 px-3 py-2.5 text-sm font-bold transition-[transform,box-shadow,background-color]",
                pathname.startsWith("/certificates")
                  ? "border-ink bg-ink text-paper shadow-[3px_3px_0_var(--yellow)]"
                  : "border-transparent text-ink hover:-translate-x-px hover:-translate-y-px hover:border-ink hover:bg-card hover:shadow-brutal-sm"
              )}
            >
              <Icon name="award" className="size-[18px]" />
              Certificates
            </Link>
            <Link
              href="/calendar"
              className={cn(
                "flex items-center gap-3 rounded-[10px] border-2 px-3 py-2.5 text-sm font-bold transition-[transform,box-shadow,background-color]",
                pathname.startsWith("/calendar")
                  ? "border-ink bg-ink text-paper shadow-[3px_3px_0_var(--yellow)]"
                  : "border-transparent text-ink hover:-translate-x-px hover:-translate-y-px hover:border-ink hover:bg-card hover:shadow-brutal-sm"
              )}
            >
              <Icon name="calendar" className="size-[18px]" />
              Calendar
            </Link>
            <Link
              href="/inbox"
              className={cn(
                "flex items-center gap-3 rounded-[10px] border-2 px-3 py-2.5 text-sm font-bold transition-[transform,box-shadow,background-color]",
                pathname.startsWith("/inbox")
                  ? "border-ink bg-ink text-paper shadow-[3px_3px_0_var(--yellow)]"
                  : "border-transparent text-ink hover:-translate-x-px hover:-translate-y-px hover:border-ink hover:bg-card hover:shadow-brutal-sm"
              )}
            >
              <Icon name="mail" className="size-[18px]" />
              Inbox
            </Link>
            <Link
              href="/notifications"
              className={cn(
                "flex items-center gap-3 rounded-[10px] border-2 px-3 py-2.5 text-sm font-bold transition-[transform,box-shadow,background-color]",
                pathname.startsWith("/notifications")
                  ? "border-ink bg-ink text-paper shadow-[3px_3px_0_var(--yellow)]"
                  : "border-transparent text-ink hover:-translate-x-px hover:-translate-y-px hover:border-ink hover:bg-card hover:shadow-brutal-sm"
              )}
            >
              <Icon name="bell" className="size-[18px]" />
              Notifications
            </Link>
          </nav>

          <div className="mt-auto pt-6">
            <div className="mb-3 flex items-center gap-2.5 border-t-2 border-dashed border-ink/35 pt-4">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-ink text-[12px] font-bold text-ink"
                style={{ background: "var(--pink)" }}
              >
                {initials(userLabel)}
              </span>
              <div className="min-w-0 truncate text-[13px] font-bold text-ink">
                {userLabel}
              </div>
            </div>
            <LogoutButton
              endpoint="/api/auth/logout"
              postLogoutPath="/auth/login"
              logoutContext="client"
            />
          </div>
        </aside>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b-2 border-ink bg-card px-4 py-3 lg:hidden">
          <span
            className="flex size-9 -rotate-3 items-center justify-center rounded-[10px] border-2 border-ink text-ink shadow-brutal-sm"
            style={{ background: accent }}
          >
            <Icon name="cap" className="size-[18px]" />
          </span>
          <span className="truncate font-heading text-base">{title}</span>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
          </div>
          <Link
            href="/profile"
            aria-label="Profile"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-ink text-[12px] font-bold text-ink [touch-action:manipulation]"
            style={{ background: "var(--pink)" }}
          >
            {initials(userLabel)}
          </Link>
        </header>

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto w-full max-w-4xl">{children}</div>
        </main>

        {/* Mobile bottom tab bar */}
        <nav
          aria-label="Primary"
          className="safe-b fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-2 border-ink bg-card lg:hidden"
        >
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold [touch-action:manipulation] transition-colors",
                  active ? "text-ink" : "text-ink/45"
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-[10px] border-2 transition-colors",
                    active
                      ? "border-ink bg-yellow shadow-brutal-sm"
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
    </ToastProvider>
  );
}
