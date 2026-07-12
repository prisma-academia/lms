import Link from "next/link";
import type { ReactNode } from "react";
import { apexHostname, isProd } from "@/lib/env";
import { apexHttpOrigin } from "@/lib/url/apex";

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
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="truncate font-heading text-[15px]">{orgName}</span>
          <Link
            href="/admin/auth/login"
            className="shrink-0 text-xs font-medium text-ink/40 hover:text-ink/60"
          >
            Admin portal
          </Link>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t-2 border-ink bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 py-6 sm:px-6">
          <p className="text-[11px] font-medium text-ink/30">
            Powered by{" "}
            <a
              href={apexUrl}
              className="underline decoration-ink/20 underline-offset-2 hover:text-ink/50"
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
