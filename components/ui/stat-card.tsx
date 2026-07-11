import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

export function StatCard({
  icon,
  iconBg = "var(--purple)",
  value,
  label,
  delta,
  deltaBg = "var(--card)",
  accent = "var(--ink)",
  className,
  children,
}: {
  icon: IconName;
  iconBg?: string;
  value: ReactNode;
  label: string;
  delta?: string;
  deltaBg?: string;
  accent?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border-2 border-ink bg-card p-4 transition-transform duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5",
        className
      )}
      style={{ boxShadow: `5px 5px 0 ${accent}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="flex size-9 items-center justify-center rounded-[10px] border-2 border-ink text-ink"
          style={{ background: iconBg }}
        >
          <Icon name={icon} className="size-[18px]" />
        </span>
        {delta ? (
          <span
            className="num inline-flex -rotate-2 items-center rounded-md border-2 border-ink px-2 py-0.5 text-[11px] font-bold text-ink"
            style={{ background: deltaBg }}
          >
            {delta}
          </span>
        ) : null}
      </div>
      {children ? (
        children
      ) : (
        <>
          <div className="num mt-3 font-heading text-[30px] leading-none">
            {value}
          </div>
          <div className="mt-1.5 text-[13px] font-bold text-ink/60">{label}</div>
        </>
      )}
    </div>
  );
}
