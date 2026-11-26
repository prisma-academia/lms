"use client";

import { cn } from "@/lib/utils";
import { THEME_PRESETS, type ThemePresetId } from "@/lib/theme/presets";

/**
 * Preset grid for tenant settings. Purely presentational — it lifts the choice
 * to SettingsForm, which PATCHes it with the rest of the settings blob.
 *
 * Swatches are rendered from the preset registry rather than by applying the
 * theme, so the admin can preview all ten without the page restyling under them.
 */
export function ThemePicker({
  value,
  onChange,
  previewDark,
}: {
  value: ThemePresetId;
  onChange: (value: ThemePresetId) => void;
  previewDark: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      {THEME_PRESETS.map((preset) => {
        const active = preset.id === value;
        const [bg, primary, muted] = previewDark
          ? preset.swatch.dark
          : preset.swatch.light;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(preset.id)}
            title={preset.description}
            className={cn(
              "flex flex-col gap-2 rounded-[12px] border-2 p-2.5 text-left outline-none transition-[transform,box-shadow] [touch-action:manipulation]",
              "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "border-foreground shadow-md"
                : "border-border hover:-translate-x-px hover:-translate-y-px hover:shadow-sm"
            )}
          >
            <span
              aria-hidden
              className="flex h-12 w-full items-end gap-1 rounded-[8px] border-2 border-border p-1.5"
              style={{ background: bg }}
            >
              <span
                className="h-4 flex-1 rounded-[3px]"
                style={{ background: primary }}
              />
              <span
                className="h-4 w-1/4 rounded-[3px]"
                style={{ background: muted }}
              />
            </span>
            <span className="flex items-center justify-between gap-2 text-[12px] font-bold leading-tight text-card-foreground">
              {preset.label}
              {/* The chosen theme is marked with a tick as well as a darker
                  border, so the choice does not rest on telling two borders apart. */}
              {active ? <span aria-hidden>✓</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
