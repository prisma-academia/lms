import type { ReactNode } from "react";
import { Icon } from "@/components/icon";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  accent,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  accent?: string;
  wide?: boolean;
}) {
  return (
    <main className="flex min-h-[100dvh] flex-1 items-center justify-center p-5">
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-sm"}`}>
        <div className="mb-5 flex justify-center">
          <span
            className="flex size-11 -rotate-3 items-center justify-center rounded-[12px] border-2 border-ink text-ink shadow-brutal-sm"
            style={{ background: accent || "var(--yellow)" }}
          >
            <Icon name="cap" className="size-6" />
          </span>
        </div>
        <div className="rounded-[14px] border-2 border-ink bg-card p-6 shadow-brutal">
          <h1 className="font-heading text-xl leading-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm font-medium text-ink/60">{subtitle}</p>
          ) : null}
          <div className="mt-5">{children}</div>
        </div>
        {footer ? (
          <div className="mt-4 text-center text-[13px] font-medium text-ink/60">
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}
