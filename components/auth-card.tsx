import type { ReactNode } from "react";
import { TenantMark } from "@/components/tenant-mark";
import { loadTenantBranding } from "@/lib/site/metadata";

/**
 * Shell for every sign-in / password screen.
 *
 * Resolves tenant branding itself so all auth routes (admin and learner, now
 * and later) show the tenant's uploaded logo and name without each page having
 * to thread it through. On the platform/apex host `loadTenantBranding` returns
 * null without touching the database and the generic product mark is used.
 * The call is `cache()`d per request, so it is free wherever a layout already
 * resolved branding for metadata.
 */
export async function AuthCard({
  title,
  subtitle,
  children,
  footer,
  accent,
  wide = false,
  logoUrl,
  orgName,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  accent?: string;
  wide?: boolean;
  /** Override the resolved branding (rarely needed). */
  logoUrl?: string | null;
  orgName?: string | null;
}) {
  const branding =
    logoUrl === undefined || orgName === undefined ? await loadTenantBranding() : null;
  const mark = logoUrl !== undefined ? logoUrl : (branding?.logoUrl ?? null);
  const org = orgName !== undefined ? orgName : (branding?.name ?? null);

  return (
    <main className="flex min-h-[100dvh] flex-1 items-center justify-center px-4 py-6 sm:p-5">
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-sm"}`}>
        <div className="mb-5 flex flex-col items-center gap-2">
          <TenantMark
            logoUrl={mark}
            name={org}
            // With a tenant but no uploaded logo, its initial is still more
            // "theirs" than the generic product cap.
            fallback={org ? "letter" : "cap"}
            accent={accent}
            className="size-11 rounded-[12px] border-border text-lg"
            // A wordmark keeps its aspect here; the card has room for it.
            logoClassName="h-12 w-auto max-w-[220px] rounded-[12px]"
            iconClassName="size-6"
          />
          {org ? (
            <span className="max-w-full truncate text-center font-heading text-[15px] leading-tight">
              {org}
            </span>
          ) : null}
        </div>
        <div className="rounded-[14px] border-2 border-border bg-card p-5 shadow-md sm:p-6">
          <h1 className="text-balance font-heading text-xl leading-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
          <div className="mt-5">{children}</div>
        </div>
        {footer ? (
          <div className="mt-4 text-center text-[13px] font-medium text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}
