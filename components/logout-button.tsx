"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";

export type LogoutContext = "platform" | "tenant-admin" | "client";

export function LogoutButton({
  endpoint,
  postLogoutPath = "/auth/login",
  logoutContext = "client",
  className,
  size = "sm",
}: {
  endpoint: string;
  postLogoutPath?: string;
  logoutContext?: LogoutContext;
  className?: string;
  size?: "sm" | "default" | "lg";
}) {
  const [pending, setPending] = useState(false);
  async function onClick() {
    setPending(true);
    await apiPost(endpoint, {}, { headers: { "x-logout-context": logoutContext } });
    window.location.href = postLogoutPath;
  }
  return (
    <Button variant="outline" size={size} className={className} disabled={pending} onClick={onClick}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
