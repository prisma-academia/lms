"use client";

import { useId, useMemo, useSyncExternalStore } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import {
  activeNavHref,
  flattenNav,
  isNavGroup,
  type IsActive,
  type NavEntry,
  type NavItem,
} from "@/components/nav-model";
import { cn } from "@/lib/utils";

// The data model lives in nav-model.ts so server-rendered shells can use it too.
export type { NavEntry, NavGroup, NavItem } from "@/components/nav-model";

/**
 * Inline pending indicator for the clicked nav link. Fixed size so it never
 * shifts layout; only visible while the link's navigation is pending.
 * Reduced-motion is handled by the global rule in globals.css.
 */
function LinkSpinner() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "ml-auto size-4 shrink-0 rounded-full border-2 border-current border-t-transparent transition-opacity",
        pending ? "animate-spin opacity-70" : "opacity-0"
      )}
    />
  );
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        // 44px on touch layouts; a little tighter where there is a pointer and
        // two dozen destinations to fit in one column.
        "flex min-h-11 items-center gap-3 rounded-[10px] border-2 px-3 py-2 text-sm font-bold outline-none [touch-action:manipulation] transition-[transform,box-shadow,background-color] lg:min-h-10",
        "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "border-border bg-primary text-primary-foreground shadow-md"
          : "border-transparent text-card-foreground hover:-translate-x-px hover:-translate-y-px hover:border-border hover:bg-accent hover:text-accent-foreground hover:shadow-sm"
      )}
    >
      {item.icon ? <Icon name={item.icon} className="size-[18px] shrink-0" /> : null}
      <span className="min-w-0 truncate">{item.label}</span>
      <LinkSpinner />
    </Link>
  );
}

/** A flat list of links. */
export function NavLinks({
  items,
  onNavigate,
  className,
  isActive,
  label,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  className?: string;
  isActive?: IsActive;
  /** Accessible name for the landmark, when the page has more than one `nav`. */
  label?: string;
}) {
  const pathname = usePathname();
  const current = activeNavHref(pathname, items, isActive);
  return (
    <nav aria-label={label} className={cn("flex flex-col gap-1", className)}>
      {items.map((item) => (
        <NavLink key={item.href} item={item} active={item.href === current} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Which groups are folded away — remembered on this device                    */
/* -------------------------------------------------------------------------- */

const listeners = new Set<() => void>();
/** Used when storage is unavailable (private mode, blocked cookies), so folding still works. */
const memory = new Map<string, string>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readCollapsed(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? "";
  } catch {
    return memory.get(key) ?? "";
  }
}

function writeCollapsed(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Remembered for this visit only.
  }
  listeners.forEach((notify) => notify());
}

/**
 * The ids of the folded groups.
 *
 * Read through `useSyncExternalStore` so the server and the first client
 * render agree (nothing folded) and the stored choice is applied straight
 * after hydration — reading storage during render would be a hydration
 * mismatch, and an effect that sets state would paint the wrong menu first.
 */
function useCollapsedGroups(storageKey: string | undefined) {
  const raw = useSyncExternalStore(
    subscribe,
    () => (storageKey ? readCollapsed(storageKey) : ""),
    () => ""
  );
  const collapsed = useMemo(() => new Set(raw ? raw.split(",") : []), [raw]);
  const setCollapsed = (id: string, fold: boolean) => {
    if (!storageKey) return;
    const next = new Set(collapsed);
    if (fold) next.add(id);
    else next.delete(id);
    writeCollapsed(storageKey, [...next].join(","));
  };
  return { collapsed, setCollapsed };
}

/**
 * Navigation in groups.
 *
 * With `storageKey`, a group can be folded and the choice is remembered on
 * this device. Without it the group headings are plain labels. Either way the
 * group that holds the current page is always open: a menu that hides where
 * you are is a menu you have to search.
 */
export function GroupedNav({
  entries,
  onNavigate,
  className,
  isActive,
  label = "Main",
  storageKey,
}: {
  entries: NavEntry[];
  onNavigate?: () => void;
  className?: string;
  isActive?: IsActive;
  label?: string;
  storageKey?: string;
}) {
  const pathname = usePathname();
  const uid = useId();
  const current = activeNavHref(pathname, flattenNav(entries), isActive);
  const { collapsed, setCollapsed } = useCollapsedGroups(storageKey);

  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-col gap-1">
        {entries.map((entry) => {
          if (!isNavGroup(entry)) {
            return (
              <li key={entry.href}>
                <NavLink item={entry} active={entry.href === current} onNavigate={onNavigate} />
              </li>
            );
          }
          if (entry.items.length === 0) return null;

          const holdsCurrent = entry.items.some((item) => item.href === current);
          const open = holdsCurrent || !collapsed.has(entry.id);
          const listId = `${uid}-${entry.id}`;
          const headingId = `${listId}-heading`;

          return (
            <li key={entry.id} className="mt-2 first:mt-0">
              {storageKey ? (
                <button
                  type="button"
                  id={headingId}
                  aria-expanded={open}
                  aria-controls={listId}
                  // Still focusable and announced, but it cannot fold the
                  // group you are standing in.
                  aria-disabled={holdsCurrent || undefined}
                  onClick={() => {
                    if (!holdsCurrent) setCollapsed(entry.id, open);
                  }}
                  className={cn(
                    "flex min-h-9 w-full items-center justify-between gap-2 rounded-[8px] px-3 py-1.5 text-left text-[12px] font-bold text-muted-foreground outline-none [touch-action:manipulation]",
                    "focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring",
                    holdsCurrent ? "cursor-default" : "hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span className="min-w-0 truncate">{entry.label}</span>
                  {holdsCurrent ? null : (
                    <Icon
                      name="chevron-down"
                      className={cn("size-3.5 shrink-0 transition-transform", open ? "" : "-rotate-90")}
                    />
                  )}
                </button>
              ) : (
                <p id={headingId} className="px-3 py-1.5 text-[12px] font-bold text-muted-foreground">
                  {entry.label}
                </p>
              )}
              <ul id={listId} aria-labelledby={headingId} hidden={!open} className="mt-0.5 flex flex-col gap-1">
                {entry.items.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} active={item.href === current} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
