import type { IconName } from "@/components/icon";

/**
 * What a shell's navigation is made of, and the questions asked of it.
 *
 * Deliberately NOT a client module: the server-rendered shells build the
 * page finder's list and the breadcrumb map from the same entries the sidebar
 * shows, and a server component cannot call a function that lives behind
 * "use client". The components that draw the navigation are in nav-links.tsx.
 */

export type NavItem = {
  href: string;
  label: string;
  icon?: IconName;
  /** Other words people use for this page, for the page finder ("students" for Learners). */
  keywords?: string;
};

/** Links that belong together, under one heading. */
export type NavGroup = { id: string; label: string; items: NavItem[] };

/** Single links and groups of links, in the order they are shown. */
export type NavEntry = NavItem | NavGroup;

export type FlatNavItem = NavItem & { group: string | null };

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

/** Every link in the navigation, in order, with the heading it sits under. */
export function flattenNav(entries: NavEntry[]): FlatNavItem[] {
  return entries.flatMap((entry): FlatNavItem[] =>
    isNavGroup(entry)
      ? entry.items.map((item) => ({ ...item, group: entry.label }))
      : [{ ...entry, group: null }]
  );
}

/** Groups with nothing left in them (every link gated off) are dropped. */
export function pruneNav(entries: NavEntry[]): NavEntry[] {
  return entries.filter((entry) => !isNavGroup(entry) || entry.items.length > 0);
}

export type IsActive = (pathname: string, href: string) => boolean;

export const prefixMatch: IsActive = (pathname, href) =>
  pathname === href || pathname.startsWith(href + "/");

/**
 * The link the current page belongs to.
 *
 * One answer, not "every link that matches": with `/admin/site` and
 * `/admin/site/pages` both in a menu, a prefix test lights up two rows. The
 * longest match is the most specific one, and that is where the reader is.
 */
export function activeNavHref(
  pathname: string,
  items: readonly NavItem[],
  isActive: IsActive = prefixMatch
): string | null {
  let best: string | null = null;
  for (const item of items) {
    if (!isActive(pathname, item.href)) continue;
    if (best === null || item.href.length > best.length) best = item.href;
  }
  return best;
}
