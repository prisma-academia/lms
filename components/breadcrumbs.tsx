"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import { activeNavHref, type FlatNavItem } from "@/components/nav-model";
import { cn } from "@/lib/utils";

/**
 * Breadcrumbs, derived from where the page is rather than declared by it.
 *
 * The trail is: the navigation group, the section, then what the address says
 * about the rest. The one thing an address cannot say is what a record is
 * called — `/admin/quizzes/cmw…` is "Cell structure checkpoint" to a person —
 * so the page's own title is used for the last step. `PageHeader` reports it
 * (see `PageTitle` below), which means any page that has a heading gets a
 * human breadcrumb with no extra work, and a page that has none still gets a
 * sensible one ("Details").
 */

/* -------------------------------------------------------------------------- */
/* The current page's title                                                    */
/* -------------------------------------------------------------------------- */

let currentTitle: string | null = null;
const listeners = new Set<() => void>();

function setCurrentTitle(next: string | null) {
  if (currentTitle === next) return;
  currentTitle = next;
  listeners.forEach((notify) => notify());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * Reports a page's title to the shell. Renders nothing.
 *
 * A module-level store rather than context: `PageHeader` is rendered by server
 * pages deep inside the shell, and this keeps it free of any provider it would
 * otherwise have to sit under.
 */
export function PageTitle({ title }: { title: string }) {
  useEffect(() => {
    setCurrentTitle(title);
    return () => {
      // Only if it is still ours: the next page's title may already be set.
      if (currentTitle === title) setCurrentTitle(null);
    };
  }, [title]);
  return null;
}

function usePageTitle(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => currentTitle,
    () => null
  );
}

/* -------------------------------------------------------------------------- */
/* The trail                                                                   */
/* -------------------------------------------------------------------------- */

/** Address segments that read better as something other than themselves. */
const WORDS: Record<string, string> = {
  new: "New",
  edit: "Edit",
  builder: "Builder",
  preview: "Preview",
};

/** A record id (cuid, uuid, number), as opposed to a word someone chose. */
function looksLikeId(segment: string): boolean {
  return /^\d+$/.test(segment) || /^(?=.*\d)[a-z0-9_-]{16,}$/i.test(segment);
}

function humanize(segment: string): string {
  const words = decodeURIComponent(segment).replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : segment;
}

export type Crumb = { label: string; href: string | null };

export function breadcrumbTrail(pathname: string, items: readonly FlatNavItem[], title: string | null): Crumb[] {
  const sectionHref = activeNavHref(pathname, items);
  const section = items.find((item) => item.href === sectionHref);

  if (!section) {
    const last = pathname.split("/").filter(Boolean).pop();
    return [{ label: title ?? (last ? humanize(last) : "Page"), href: null }];
  }

  const crumbs: Crumb[] = [];
  if (section.group) crumbs.push({ label: section.group, href: null });

  const rest = pathname.slice(section.href.length).split("/").filter(Boolean);
  if (rest.length === 0) {
    crumbs.push({ label: section.label, href: null });
    return crumbs;
  }

  crumbs.push({ label: section.label, href: section.href });
  rest.forEach((segment, index) => {
    const isLast = index === rest.length - 1;
    const label = looksLikeId(segment) ? "Details" : (WORDS[segment] ?? humanize(segment));
    if (isLast) {
      crumbs.push({ label: title ?? label, href: null });
      return;
    }
    // Only the step straight after the section is known to be a page of its
    // own (the record a deeper page belongs to). Anything further in is shown
    // as text: a breadcrumb that leads to a 404 is worse than one that is
    // not a link.
    const href = index === 0 ? `${section.href}/${segment}` : null;
    crumbs.push({ label, href });
  });
  return crumbs;
}

export function Breadcrumbs({
  items,
  className,
}: {
  /** Every destination in the shell's navigation, with its group. */
  items: FlatNavItem[];
  className?: string;
}) {
  const pathname = usePathname();
  const title = usePageTitle();
  const crumbs = breadcrumbTrail(pathname, items, title);

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li
              key={`${index}-${crumb.label}`}
              className={cn("flex items-center gap-1.5", isLast ? "min-w-0" : "shrink-0")}
            >
              {index > 0 ? (
                <Icon name="chevron-right" className="size-3.5 shrink-0 text-muted-foreground" />
              ) : null}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="rounded-[6px] text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(isLast ? "truncate text-foreground" : "text-muted-foreground")}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
