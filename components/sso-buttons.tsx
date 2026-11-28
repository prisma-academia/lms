import { Suspense } from "react";
import { loadTenantPageContext } from "@/lib/db/page-context";
import { runWithContext } from "@/lib/db/tenant-context";
import { ssoButtons } from "@/lib/integrations/sso";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { logger } from "@/lib/logger";
import { SsoNotice } from "./sso-notice";

/**
 * "Sign in with …" buttons for the academy on this host — one per enabled
 * single sign-on connection that serves this audience. Renders nothing when
 * there are none (and never breaks the login page if the lookup fails).
 */
export async function SsoButtons({ audience, next }: { audience: "learner" | "staff"; next?: string | null }) {
  let buttons: { id: string; label: string; provider: string }[] = [];
  try {
    const page = await loadTenantPageContext();
    const tenant = page.tenant;
    if (tenant && tenant.status === "ACTIVE") {
      buttons = await runWithContext({ mode: "tenant-admin", tenantId: tenant.id }, () => ssoButtons(tenant.id, audience));
    }
  } catch (err) {
    logger.warn({ err }, "sso_buttons_failed");
    buttons = [];
  }

  return (
    <div className="mt-5 space-y-3">
      <Suspense fallback={null}>
        <SsoNotice />
      </Suspense>
      {buttons.length > 0 ? (
        <>
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-muted-foreground" aria-hidden>
            <span className="h-0.5 flex-1 bg-border" />
            or
            <span className="h-0.5 flex-1 bg-border" />
          </div>
          <div className="flex flex-col gap-2">
            {buttons.map((b) => {
              const q = new URLSearchParams({ audience });
              if (next) q.set("next", next);
              return (
                <a key={b.id} href={`/api/sso/${encodeURIComponent(b.id)}/start?${q.toString()}`} className={buttonVariants({ variant: "outline", className: "w-full" })}>
                  <Icon name={b.provider === "oidc_generic" ? "lock" : "user-check"} />
                  {b.label}
                </a>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
