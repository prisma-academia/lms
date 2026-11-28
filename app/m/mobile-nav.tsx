"use client";

import Link from "next/link";
import { useRef } from "react";
import { Icon } from "@/components/icon";

/**
 * Phone-width menu for the marketing header. A native <details> does the
 * open/close (works before hydration); this only closes it after a link is
 * picked, since in-page anchors don't navigate away.
 */
export function MobileNav({ items }: { items: readonly { href: string; label: string }[] }) {
  const ref = useRef<HTMLDetailsElement>(null);

  return (
    <details ref={ref} className="group relative md:hidden">
      <summary
        aria-label="Menu"
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-[10px] border-2 border-border hover:border-foreground [&::-webkit-details-marker]:hidden"
      >
        <Icon name="menu" className="size-[18px] group-open:hidden" />
        <Icon name="x" className="hidden size-[18px] group-open:block" />
      </summary>
      <nav
        aria-label="Main"
        className="absolute right-0 mt-2 flex w-56 flex-col rounded-[14px] border-2 border-foreground bg-card p-2 shadow-md"
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => ref.current?.removeAttribute("open")}
            className="rounded-[10px] px-3 py-2.5 text-sm font-bold text-muted-foreground hover:bg-background hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </details>
  );
}
