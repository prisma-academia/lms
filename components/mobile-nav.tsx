"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { LogoutButton, type LogoutContext } from "@/components/logout-button";

export function MobileNav({
  title,
  nav,
  userLabel,
  logoutEndpoint,
  logoutRedirect,
  logoutContext,
}: {
  title: string;
  nav: NavItem[];
  userLabel: string;
  logoutEndpoint: string;
  logoutRedirect: string;
  logoutContext: LogoutContext;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b-2 border-border bg-card px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border-2 border-border bg-card shadow-sm [touch-action:manipulation] active:translate-x-px active:translate-y-px active:shadow-none"
        >
          <Icon name={open ? "x" : "menu"} className="size-5" />
        </button>
        <span className="truncate font-heading text-base">{title}</span>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="safe-b absolute inset-x-0 top-0 max-h-[100dvh] overflow-y-auto border-b-2 border-border bg-card px-4 pb-6 pt-[68px] shadow-md">
            <NavLinks items={nav} onNavigate={() => setOpen(false)} />
            <div className="mt-4 border-t-2 border-dashed border-border pt-4">
              <div className="mb-2 truncate text-sm font-bold text-muted-foreground">
                {userLabel}
              </div>
              <LogoutButton
                endpoint={logoutEndpoint}
                postLogoutPath={logoutRedirect}
                logoutContext={logoutContext}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
