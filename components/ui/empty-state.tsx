import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon = "check-circle",
  title,
  children,
  action,
  className,
}: {
  icon?: IconName;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-4 py-10 text-center",
        className
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-ink/35 text-ink/60">
        <Icon name={icon} className="size-5" />
      </span>
      {title ? <p className="font-heading text-base text-ink">{title}</p> : null}
      {children ? (
        <p className="max-w-sm text-sm font-medium text-ink/60">{children}</p>
      ) : null}
      {action}
    </div>
  );
}
