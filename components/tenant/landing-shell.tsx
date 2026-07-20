import Link from "next/link";
import type { ReactNode } from "react";
import { apexHostname, isProd } from "@/lib/env";
import { apexHttpOrigin } from "@/lib/url/apex";
import { Button } from "@/components/ui/button";

export function TenantLandingShell({
  orgName,
  children,
}: {
  orgName: string;
  children: ReactNode;
}) {
  const apex = apexHostname();
  const apexUrl = isProd ? `https://${apex}` : apexHttpOrigin();

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-30 border-b-2 border-border bg-card text-card-foreground/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="truncate font-heading text-[15px] hover:text-muted-foreground">
            {orgName}
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/auth/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/auth/register">Enroll</Link>
            </Button>
            <Link
              href="/admin/auth/login"
              className="ml-1 hidden text-xs font-medium text-muted-foreground hover:text-foreground sm:inline"
            >
              Admin portal
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t-2 border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 py-6 sm:px-6">
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
