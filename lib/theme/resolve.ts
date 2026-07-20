import { cache } from "react";
import { cookies, headers } from "next/headers";
import { resolveHost } from "@/lib/auth/context";
import { loadTenantBranding } from "@/lib/site/metadata";
import { brandOverrideVars } from "@/lib/theme/color";
import {
  THEME_MODE_COOKIE,
  THEME_RESOLVED_COOKIE,
  parseResolvedMode,
  parseThemeMode,
  type ThemeMode,
} from "@/lib/theme/cookie";
import {
  DEFAULT_THEME_PRESET,
  isThemePresetId,
  type ThemePresetId,
} from "@/lib/theme/presets";

export type ResolvedTheme = {
  /** null on platform/apex/unknown hosts — those keep the default theme. */
  preset: ThemePresetId | null;
  /** The user's stored preference. */
  mode: ThemeMode;
  /** What to render on this request. `system` resolves to light until the script corrects it. */
  dark: boolean;
  /** Inline CSS custom properties layering the tenant brand hex over the preset. */
  brandVars: Record<string, string> | null;
};

const FALLBACK: ResolvedTheme = {
  preset: null,
  mode: "system",
  dark: false,
  brandVars: null,
};

/**
 * Resolve the theme for the current request.
 *
 * Called from RootLayout, which is the only place <html> exists — the tenant vs
 * platform split happens in layouts *below* it, so RootLayout has to resolve the
 * host itself rather than receive it from a child.
 *
 * `resolveHost` short-circuits non-tenant hosts before any query, so platform
 * and apex requests do zero extra database work. For tenant hosts the branding
 * lookup is already request-deduped via `cache()`, so this adds no query.
 *
 * MUST NOT THROW: RootLayout is above every error boundary except
 * `global-error.tsx`, so a failure here would blank the whole app rather than
 * degrade to the default theme.
 */
export const resolveThemeForRequest = cache(
  async function resolveThemeForRequest(): Promise<ResolvedTheme> {
    try {
      const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);

      const mode = parseThemeMode(cookieStore.get(THEME_MODE_COOKIE)?.value);
      // For `system`, prefer what the client last resolved. Only a first-ever
      // visit falls through to `false` and relies on the inline script.
      const resolved = parseResolvedMode(
        cookieStore.get(THEME_RESOLVED_COOKIE)?.value
      );
      const dark =
        mode === "dark" ? true : mode === "light" ? false : resolved === "dark";

      const host = resolveHost(headerList.get("host"));
      if (host.mode !== "tenant") {
        return { preset: null, mode, dark, brandVars: null };
      }

      const branding = await loadTenantBranding();
      if (!branding) return { preset: null, mode, dark, brandVars: null };

      const { settings } = branding;
      const preset = isThemePresetId(settings.themePreset)
        ? settings.themePreset
        : DEFAULT_THEME_PRESET;

      const brandVars = settings.themePrimaryOverride
        ? brandOverrideVars(settings.primaryColor)
        : null;

      return { preset, mode, dark, brandVars };
    } catch {
      return FALLBACK;
    }
  }
);
