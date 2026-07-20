"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";
import {
  THEME_MODE_COOKIE,
  THEME_RESOLVED_COOKIE,
  themeCookieAttributes,
  type ThemeMode,
} from "@/lib/theme/cookie";

const OPTIONS: { value: ThemeMode; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
];

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; ${themeCookieAttributes(
    location.protocol === "https:"
  )}`;
}

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * Per-user colour-mode toggle.
 *
 * Writes the cookie and flips `.dark` synchronously — there is no server state
 * to update, so no REST call, no router.refresh() and no CSRF concern. This
 * does not violate the codebase's "no server actions" convention; it simply has
 * no server side.
 */
export function ThemeToggle({
  initialMode,
  className,
}: {
  initialMode: ThemeMode;
  className?: string;
}) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  const apply = useCallback((next: ThemeMode) => {
    const dark = next === "dark" || (next === "system" && prefersDark());
    document.documentElement.classList.toggle("dark", dark);
    writeCookie(THEME_MODE_COOKIE, next);
    writeCookie(THEME_RESOLVED_COOKIE, dark ? "dark" : "light");
  }, []);

  // Follow the OS while in system mode, so a change there takes effect without
  // a reload. Inactive for explicit light/dark.
  useEffect(() => {
    if (mode !== "system" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [mode, apply]);

  return (
    <div
      role="radiogroup"
      aria-label="Color mode"
      className={cn(
        "inline-flex overflow-hidden rounded-[10px] border-2 border-border",
        className
      )}
    >
      {OPTIONS.map((option, i) => {
        const active = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => {
              setMode(option.value);
              apply(option.value);
            }}
            className={cn(
              "flex size-8 items-center justify-center [touch-action:manipulation] transition-colors",
              i > 0 && "border-l-2 border-border",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon name={option.icon} className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
