"use client";

import { useState } from "react";
import Link from "next/link";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar } from "@/components/ui/avatar";
import { Icon, type IconName } from "@/components/icon";
import { LogoutButton, type LogoutContext } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ThemeMode } from "@/lib/theme/cookie";
import { cn } from "@/lib/utils";

/**
 * The account menu: who is signed in, how the app looks for them, and the way
 * out. One place for the three things that used to be stacked at the foot of
 * the sidebar, where a long navigation pushed them off a short screen.
 */
export function UserMenu({
  label,
  detail,
  avatarUrl,
  themeMode,
  links = [],
  logoutEndpoint,
  logoutRedirect,
  logoutContext,
  className,
}: {
  /** The person's name (or email, when they have not given one). */
  label: string;
  /** A second line: their role, or which portal this is. */
  detail?: string | null;
  avatarUrl?: string | null;
  themeMode: ThemeMode;
  /** Personal destinations, e.g. the learner's profile. */
  links?: { href: string; label: string; icon?: IconName }[];
  logoutEndpoint: string;
  logoutRedirect: string;
  logoutContext: LogoutContext;
  className?: string;
}) {
  // The menu's contents unmount when it closes. Holding the mode here means
  // it reopens showing what the person last chose, not what the server sent.
  const [mode, setMode] = useState<ThemeMode>(themeMode);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${label}`}
          className={cn(
            "flex h-11 shrink-0 items-center gap-2 rounded-[10px] border-2 border-border bg-card pl-1 pr-1 text-sm font-bold text-card-foreground shadow-sm outline-none [touch-action:manipulation] transition-[transform,box-shadow] sm:pr-2 lg:h-10",
            "hover:-translate-x-px hover:-translate-y-px hover:shadow-md active:translate-x-px active:translate-y-px active:shadow-none",
            "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
            className
          )}
        >
          <Avatar label={label} src={avatarUrl} className="size-8 text-[11px] lg:size-7" />
          <span className="hidden max-w-40 truncate sm:block">{label}</span>
          <Icon name="chevron-down" className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <Avatar label={label} src={avatarUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-popover-foreground">{label}</p>
            {detail ? (
              <p className="truncate text-[12px] font-medium text-muted-foreground">{detail}</p>
            ) : null}
          </div>
        </div>

        {links.length > 0 ? (
          <ul className="border-t-2 border-dashed border-border p-2">
            {links.map((link) => (
              <li key={link.href}>
                <PopoverClose asChild>
                  <Link
                    href={link.href}
                    className="flex min-h-11 items-center gap-3 rounded-[8px] px-2 text-sm font-bold text-popover-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring"
                  >
                    {link.icon ? <Icon name={link.icon} className="size-[18px] shrink-0" /> : null}
                    <span className="min-w-0 truncate">{link.label}</span>
                  </Link>
                </PopoverClose>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t-2 border-dashed border-border px-4 py-3">
          <span className="text-[13px] font-bold text-popover-foreground">Appearance</span>
          <ThemeToggle initialMode={mode} onChange={setMode} size="md" />
        </div>

        <div className="border-t-2 border-dashed border-border px-4 py-3">
          <LogoutButton
            endpoint={logoutEndpoint}
            postLogoutPath={logoutRedirect}
            logoutContext={logoutContext}
            size="default"
            className="w-full"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
