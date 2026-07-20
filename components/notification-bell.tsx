"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/client/api";
import { Icon } from "@/components/icon";

/** Bell icon linking to /notifications, with an unread count badge. */
export function NotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await apiGet<{ unreadCount: number }>("/api/client/notifications");
      if (active && res.data) setCount(res.data.unreadCount);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Link
      href="/notifications"
      aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
      className="relative flex size-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-border bg-card text-card-foreground [touch-action:manipulation]"
    >
      <Icon name="bell" className="size-[18px]" />
      {count > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full border-2 border-border bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
