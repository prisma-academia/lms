"use client";

import { useSearchParams } from "next/navigation";
import { ssoMessage } from "@/lib/integrations/sso-urls";

/** The reason a single sign-on attempt came back to the login page, if it did. */
export function SsoNotice() {
  const params = useSearchParams();
  const message = ssoMessage(params.get("sso"));
  if (!message) return null;
  return (
    <p role="alert" className="rounded-[10px] border-2 border-destructive px-3 py-2 text-sm font-bold text-destructive">
      {message}
    </p>
  );
}
