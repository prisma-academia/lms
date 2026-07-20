/**
 * Minimal sRGB → OKLCh conversion, no dependencies.
 *
 * Used to layer a tenant's free-form `settings.primaryColor` hex over the
 * chosen preset's `--primary`. Runs on the server at request time so the value
 * can be emitted as an inline style on <html> in the first byte of HTML — a
 * client-side conversion would reintroduce the flash this design removes.
 */

export type Oklch = { l: number; c: number; h: number };

function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Returns null for anything that is not a 3- or 6-digit hex colour. */
export function hexToOklch(hex: string): Oklch | null {
  const match = HEX_RE.exec(hex.trim());
  if (!match) return null;

  const raw = match[1];
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw;

  const r = srgbToLinear(parseInt(full.slice(0, 2), 16) / 255);
  const g = srgbToLinear(parseInt(full.slice(2, 4), 16) / 255);
  const b = srgbToLinear(parseInt(full.slice(4, 6), 16) / 255);

  const lp = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mp = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sp = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const l = 0.2104542553 * lp + 0.793617785 * mp - 0.0040720468 * sp;
  const a = 1.9779984951 * lp - 2.428592205 * mp + 0.4505937099 * sp;
  const bb = 0.0259040371 * lp + 0.7827717662 * mp - 0.808675766 * sp;

  const c = Math.hypot(a, bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l, c, h };
}

export function oklchString({ l, c, h }: Oklch): string {
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(4)})`;
}

/**
 * Contrast pair for a background colour, chosen from OKLab lightness.
 *
 * Computed rather than read from the preset so the pair can never desync: if a
 * tenant overrides `--primary` we must also override `--primary-foreground`, or
 * a dark brand colour keeps the preset's dark foreground and the text vanishes.
 * The 0.62 threshold is where near-black overtakes near-white on contrast ratio.
 */
export function foregroundFor(color: Oklch): string {
  return color.l >= 0.62 ? "oklch(0.1450 0 0)" : "oklch(0.9850 0 0)";
}

/**
 * The CSS custom properties needed to layer a brand hex over a preset.
 * Returns null when the hex is unparseable, so callers fall through to the
 * preset's own palette rather than emitting broken values.
 */
export function brandOverrideVars(hex: string): Record<string, string> | null {
  const color = hexToOklch(hex);
  if (!color) return null;

  const value = oklchString(color);
  const foreground = foregroundFor(color);

  return {
    "--primary": value,
    "--primary-foreground": foreground,
    "--ring": value,
    "--sidebar-primary": value,
    "--sidebar-primary-foreground": foreground,
  };
}
