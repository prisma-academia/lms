import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tokens that ship a matching `-foreground`. When a caller passes one of these
 * as `color`, we set the paired foreground too — otherwise the label keeps
 * `--foreground`, whose contrast against a saturated badge background is not
 * guaranteed and varies per theme preset.
 */
const PAIRED_FOREGROUND: Record<string, string> = {
  "var(--primary)": "var(--primary-foreground)",
  "var(--secondary)": "var(--secondary-foreground)",
  "var(--accent)": "var(--accent-foreground)",
  "var(--destructive)": "var(--destructive-foreground)",
  "var(--success)": "var(--success-foreground)",
  "var(--warning)": "var(--warning-foreground)",
  "var(--info)": "var(--info-foreground)",
  "var(--card)": "var(--card-foreground)",
  "var(--muted)": "var(--muted-foreground)",
};

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
  const foreground = color
    ? PAIRED_FOREGROUND[color.trim().replace(/\s+/g, "")]
    : undefined;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border-2 border-border px-2 py-0.5 text-[11px] font-bold leading-tight",
        // Only fall back to --foreground when we could not pair the background.
        foreground ? undefined : "text-foreground",
        rotate && "-rotate-2",
        className
      )}
      style={
        color
          ? { background: color, ...(foreground ? { color: foreground } : {}) }
          : undefined
      }
    >
      {children}
    </span>
  );
}
