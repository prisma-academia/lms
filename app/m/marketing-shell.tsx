import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { env } from "@/lib/env";
import { RegisterDialog } from "./register/register-dialog";
import { MobileNav } from "./mobile-nav";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#exams", label: "CBT exams" },
  { href: "/#website", label: "Website builder" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
] as const;

const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#exams", label: "CBT exams" },
      { href: "/#website", label: "Website builder" },
      { href: "/#integrations", label: "API and integrations" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/#faq", label: "FAQ" },
      { href: "/register", label: "Create your academy" },
    ],
  },
] as const;

/*
 * The apex site has no sign-in link on purpose: academy staff and learners sign
 * in on their own academy's address, and the operator console is not advertised.
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  const productName = env.PRODUCT_NAME;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-30 border-b-2 border-border bg-card text-card-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label={`${productName} home`}>
            <span className="flex size-9 -rotate-3 items-center justify-center rounded-[10px] border-2 border-foreground bg-primary text-primary-foreground shadow-sm">
              <Icon name="cap" className="size-[18px]" />
            </span>
            <span className="font-heading text-[15px]">{productName}</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
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
          <div className="flex items-center gap-2">
            <RegisterDialog size="sm">Start free</RegisterDialog>
            <MobileNav items={NAV} />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t-2 border-border bg-card text-card-foreground">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex size-8 -rotate-3 items-center justify-center rounded-[10px] border-2 border-foreground bg-primary text-primary-foreground">
                <Icon name="cap" className="size-4" />
              </span>
              <span className="font-heading text-[15px]">{productName}</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm font-medium text-muted-foreground">
              A learning management system for academies: courses, CBT exams,
              certificates, a website and online payments in one place.
            </p>
          </div>
          {FOOTER_GROUPS.map((group) => (
            <div key={group.title}>
              <h2 className="font-heading text-sm">{group.title}</h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm font-bold text-muted-foreground">
                {group.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t-2 border-border">
          <p className="num mx-auto max-w-6xl px-4 py-4 text-[13px] font-medium text-muted-foreground sm:px-6">
            © {new Date().getFullYear()} {productName}
          </p>
        </div>
      </footer>
    </div>
  );
}
