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
        "inline-flex overflow-hidden rounded-[10px] border-2 border-ink shadow-brutal-sm",
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
              i > 0 && "border-l-2 border-ink",
              active ? "bg-yellow text-ink" : "bg-card text-ink hover:bg-paper"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
