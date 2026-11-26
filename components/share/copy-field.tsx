"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * A read-only value with a Copy button — a link, a code.
 *
 * The value sits in a real text field rather than a styled <span>: it can be
 * focused, selected and copied by hand, which is the fallback when the
 * clipboard API is unavailable (an insecure origin, an old browser, a
 * permission prompt that was dismissed).
 */
export function CopyField({
  label,
  value,
  hint,
  mono = true,
  copyLabel = "Copy",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  /** Button text. The field's label is added for screen readers. */
  copyLabel?: string;
  className?: string;
}) {
  const uid = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), state === "copied" ? 2500 : 6000);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setState("copied");
        return;
      }
    } catch {
      // Fall through to selecting the text for a manual copy.
    }
    fieldRef.current?.focus();
    fieldRef.current?.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    setState(ok ? "copied" : "manual");
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={`${uid}-field`} className="text-[13px] font-bold text-foreground">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={`${uid}-field`}
          ref={fieldRef}
          type="text"
          readOnly
          value={value}
          aria-describedby={hint ? `${uid}-hint` : undefined}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(
            "min-w-0 flex-1 rounded-[10px] border-2 border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring",
            mono && "font-mono"
          )}
        />
        <Button type="button" variant="outline" onClick={copy} className="shrink-0">
          <Icon name={state === "copied" ? "check" : "link"} aria-hidden />
          {state === "copied" ? "Copied" : copyLabel}
          <span className="sr-only"> {label.toLowerCase()}</span>
        </Button>
      </div>
      {hint ? (
        <p id={`${uid}-hint`} className="text-xs font-medium text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {/* Announced when it changes; empty otherwise. */}
      <p aria-live="polite" className="sr-only">
        {state === "copied"
          ? `${label} copied.`
          : state === "manual"
            ? "Could not copy automatically. The text is selected; press Control or Command and C."
            : ""}
      </p>
      {state === "manual" ? (
        <p className="text-xs font-bold text-muted-foreground">
          Couldn&rsquo;t copy automatically — the text is selected, press Ctrl+C (or Cmd+C).
        </p>
      ) : null}
    </div>
  );
}
