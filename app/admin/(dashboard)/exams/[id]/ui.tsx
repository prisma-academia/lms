"use client";

import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

/** A checkbox with a bold label and a plain-English line on what it does. */
export function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-start gap-3 rounded-[10px] border-2 border-border bg-background p-3",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
      )}
    >
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} disabled={disabled} className="mt-0.5" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-bold text-foreground">{label}</span>
        {description ? <span className="text-xs font-medium text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}

export function SectionHeading({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 className="font-heading text-lg leading-tight">{title}</h2>
        {children ? <p className="mt-1 max-w-prose text-[13px] font-medium text-muted-foreground">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Notice({
  tone = "info",
  icon,
  children,
  className,
}: {
  tone?: "info" | "warn" | "error" | "ok";
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  const color =
    tone === "error" ? "var(--destructive)" : tone === "warn" ? "var(--warning)" : tone === "ok" ? "var(--success)" : "var(--info)";
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn("flex items-start gap-2.5 rounded-[10px] border-2 border-border bg-card px-3.5 py-3 text-[13px] font-medium", className)}
      style={{ boxShadow: `inset 5px 0 0 ${color}` }}
    >
      <Icon
        name={icon ?? (tone === "error" ? "alert-triangle" : tone === "warn" ? "alert-triangle" : tone === "ok" ? "check-circle" : "help-circle")}
        className="mt-0.5 size-4 shrink-0"
        aria-hidden
      />
      <div className="min-w-0 flex-1 pl-0.5">{children}</div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-[14px] border-2 border-border bg-card p-4">
      <div className="text-xs font-black uppercase text-muted-foreground">{label}</div>
      <div className="num mt-1 text-2xl font-black">{value}</div>
      {hint ? <div className="mt-0.5 text-xs font-medium text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** Integer from a text box; NULL for empty or not a whole number. */
export function intOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}

export const smallSelect =
  "min-h-9 rounded-[8px] border-2 border-border bg-card px-2 py-1 text-[13px] font-medium text-card-foreground outline-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60";
