import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  className,
  color,
  rotate = false,
}: {
  children: ReactNode;
  className?: string;
  /** background color (CSS value); defaults to transparent */
  color?: string;
  rotate?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border-2 border-ink px-2 py-0.5 text-[11px] font-bold leading-tight text-ink",
        rotate && "-rotate-2",
        className
      )}
      style={color ? { background: color } : undefined}
    >
      {children}
    </span>
  );
}
