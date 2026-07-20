"use client";

import { cn } from "@/lib/utils";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex overflow-hidden rounded-[10px] border-2 border-border shadow-sm",
        className
      )}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "px-4 py-2 text-[13px] font-bold [touch-action:manipulation] transition-colors",
              i > 0 && "border-l-2 border-border",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
