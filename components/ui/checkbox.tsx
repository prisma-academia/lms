"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/icon";

/**
 * Checkbox matching the app's neo-brutalist controls (2px border, hard shadow,
 * press offset). Radix handles the indeterminate state and the hidden native
 * input, which a styled <input type="checkbox"> cannot do accessibly.
 */
export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer flex size-5 shrink-0 items-center justify-center rounded-[6px] border-2 border-border bg-card text-primary-foreground shadow-sm transition-transform",
        "hover:-translate-x-px hover:-translate-y-px hover:shadow-md",
        "active:translate-x-px active:translate-y-px active:shadow-none",
        "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
        "data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {props.checked === "indeterminate" ? (
          <span className="h-0.5 w-2.5 rounded-full bg-current" />
        ) : (
          <Icon name="check" className="size-3.5" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
