"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { TenantMark } from "@/components/tenant-mark";
import { Icon } from "@/components/icon";
import { GroupedNav } from "@/components/nav-links";
import type { NavEntry } from "@/components/nav-model";
import { PageFinderButton } from "@/components/command-palette";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * The staff shell below the `lg` breakpoint: a top bar, and the navigation in
 * a drawer.
 *
 * The drawer is a real dialog (the shared `Sheet`): focus is trapped in it and
 * returned to the menu button when it closes, Escape and the backdrop close
 * it, and the page behind does not scroll — none of which the hand-rolled
 * overlay it replaces did.
 */
export function MobileNav({
  title,
  subtitle,
  logoUrl,
  homeHref,
  nav,
  navStorageKey,
  account,
}: {
  title: string;
  subtitle?: string | null;
  logoUrl?: string | null;
  homeHref: string;
  nav: NavEntry[];
  navStorageKey?: string;
  /** The account menu, supplied by the shell so both layouts share one. */
  account: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 border-b-2 border-border bg-card px-3 py-2 lg:hidden print:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border-2 border-border bg-card shadow-sm outline-none [touch-action:manipulation] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-x-px active:translate-y-px active:shadow-none"
      >
        <Icon name="menu" className="size-5" />
      </button>

      <Link
        href={homeHref}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <TenantMark logoUrl={logoUrl} name={title} className="size-9 text-[15px]" iconClassName="size-[18px]" />
        <span className="min-w-0 truncate font-heading text-base">{title}</span>
      </Link>

      <PageFinderButton compact className="shrink-0" />
      {account}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="max-w-[20rem]">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{subtitle ?? "Menu"}</SheetDescription>
          </SheetHeader>
          <SheetBody className="px-3">
            <GroupedNav entries={nav} storageKey={navStorageKey} onNavigate={() => setOpen(false)} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </header>
  );
}
