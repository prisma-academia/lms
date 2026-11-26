import Link from "next/link";
import type { ReactNode } from "react";
import { apexHostname, isProd } from "@/lib/env";
import { apexHttpOrigin } from "@/lib/url/apex";
import { Button } from "@/components/ui/button";

export type LandingNavLink = {
  href: string;
  label: string;
};

export function TenantLandingShell({
  orgName,
  logoUrl,
  navLinks = [],
  signInHref = "/auth/login",
  registerHref = "/auth/register",
  signedIn = false,
  header,
  footer,
  children,
}: {
  orgName: string;
  logoUrl?: string | null;
  navLinks?: LandingNavLink[];
  /**
   * Where the header's two account buttons lead. A page that wants the visitor
   * back afterwards (a course, a programme) passes links that carry `?next=`.
   */
  signInHref?: string;
  registerHref?: string;
  /** A learner is signed in: offer their dashboard instead of sign-in and register. */
  signedIn?: boolean;
  /**
   * The academy's own header and footer (Site → Header and footer), already
   * sanitized. When given they replace the built-in ones entirely.
   */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const apex = apexHostname();
  const apexUrl = isProd ? `https://${apex}` : apexHttpOrigin();

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {header ?? (
      <header className="sticky top-0 z-30 border-b-2 border-border bg-card text-card-foreground/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-2 truncate font-heading text-[15px] hover:text-muted-foreground"
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="size-7 shrink-0 object-contain" />
              ) : null}
              <span className="truncate">{orgName}</span>
            </Link>
            {navLinks.length > 0 ? (
              <nav className="hidden items-center gap-4 md:flex">
                {navLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {signedIn ? (
              <Button asChild size="sm">
                <Link href="/dashboard">My dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={signInHref}>Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={registerHref}>Register</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      )}

      <div className="flex-1">{children}</div>

      {footer}
      {/* Always present, under the academy's own footer too: the staff way in,
          and who runs the platform. */}
      <footer className="border-t-2 border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-4 sm:px-6">
          <Link
            href="/admin/auth/login"
            className="text-[11px] font-medium text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
          >
            Staff sign-in
          </Link>
          <p className="text-[11px] font-medium text-muted-foreground">
            Powered by{" "}
            <a
              href={apexUrl}
              className="underline decoration-border underline-offset-2 hover:text-muted-foreground"
              target={isProd ? "_blank" : undefined}
              rel={isProd ? "noopener noreferrer" : undefined}
            >
              {apex}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
