import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  color = "var(--primary)",
  className,
  size = "md",
}: {
  value: number;
  color?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const h = size === "sm" ? "h-2" : size === "lg" ? "h-3.5" : "h-3";
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "overflow-hidden rounded-full border-2 border-border bg-muted",
        h,
        className
      )}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}
