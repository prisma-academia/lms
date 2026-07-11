"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon?: IconName };

export function NavLinks({
  items,
  onNavigate,
  className,
  isActive: isActiveFn,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  className?: string;
  isActive?: (pathname: string, href: string) => boolean;
}) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {items.map((n) => {
        const active = isActiveFn
          ? isActiveFn(pathname, n.href)
          : pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-[10px] border-2 px-3 py-2.5 text-sm font-bold [touch-action:manipulation] transition-[transform,box-shadow,background-color]",
              active
                ? "border-ink bg-ink text-paper shadow-[3px_3px_0_var(--yellow)]"
                : "border-transparent text-ink hover:-translate-x-px hover:-translate-y-px hover:border-ink hover:bg-card hover:shadow-brutal-sm"
            )}
          >
            {n.icon ? <Icon name={n.icon} className="size-[18px]" /> : null}
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
