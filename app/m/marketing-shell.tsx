import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { env } from "@/lib/env";
import { platformHttpOrigin } from "@/lib/url/platform";
import { RegisterDialog } from "./register/register-dialog";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
] as const;

export function MarketingShell({ children }: { children: ReactNode }) {
  const productName = env.PRODUCT_NAME;
  const platformSignIn = `${platformHttpOrigin()}/auth/login`;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-30 border-b-2 border-border bg-card text-card-foreground">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-9 -rotate-3 items-center justify-center rounded-[10px] border-2 border-foreground bg-primary text-primary-foreground shadow-sm">
              <Icon name="cap" className="size-[18px]" />
            </span>
            <span className="font-heading text-[15px]">{productName}</span>
          </Link>
          <nav className="hidden items-center gap-6 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-bold text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <a
              href={platformSignIn}
              className="text-sm font-bold text-muted-foreground hover:text-foreground"
            >
              Sign in
            </a>
            <RegisterDialog size="sm">Start free</RegisterDialog>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t-2 border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm font-medium text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            {productName} — a complete learning platform for organizations of
            any size.
          </p>
          <div className="flex gap-4 font-bold">
            <Link href="/#features" className="hover:text-foreground">
              Features
            </Link>
            <Link href="/#pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link href="/#how-it-works" className="hover:text-foreground">
              How it works
            </Link>
            <Link href="/register" className="hover:text-foreground">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
