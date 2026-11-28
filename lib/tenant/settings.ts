import { z } from "zod";
import { DEFAULT_THEME_PRESET, themePresetSchema } from "@/lib/theme/presets";

/**
 * Typed schema for `Tenant.settingsJson` (PRD §5.8). Stored in the existing
 * JSON column — no migration. Reads never throw: unknown/legacy shapes fall
 * back to defaults and unknown keys are stripped.
 */

export const MODULE_KEYS = [
  "users",
  "clients",
  "groups",
  "courses",
  "programmes",
  "enrollments",
  "assignments",
  "quizzes",
  "certificates",
  "events",
  "messages",
  "library",
  "roles",
  "templates",
  "activity",
  "billing",
  "fees",
  "site",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

const onboardingSchema = z.object({
  completedAt: z.string().optional(),
  completedSteps: z.array(z.string()).optional(),
  trialReminder7dSentAt: z.string().optional(),
  trialReminder1dSentAt: z.string().optional(),
});

const brandingAssetsSchema = z.object({
  icon32: z.string().min(1).max(300).optional(),
  apple180: z.string().min(1).max(300).optional(),
  og1200: z.string().min(1).max(300).optional(),
});

export const tenantSettingsSchema = z.object({
  logoKey: z.string().min(1).max(300).optional(),
  /** Optional favicon override; when set, replaces auto-generated icon32/apple. */
  faviconKey: z.string().min(1).max(300).optional(),
  /** Auto-generated from logo on finalize (icon32, apple180, og1200). */
  brandingAssets: brandingAssetsSchema.optional(),
  /**
   * Landing-page hero image, exposed to templates as `{{ tenant.heroImageUrl }}`.
   * A setting rather than a `SitePage` column because the same photograph is
   * what a tenant wants at the top of every public page, and duplicating it per
   * page would mean re-uploading it to change it once.
   */
  /*
   * Nullable, not merely optional. The settings PATCH merges `{...current,
   * ...incoming}`, so an omitted key keeps its old value — meaning removal is
   * impossible to express by leaving the field out. An explicit `null` is what
   * lets "Remove" actually remove.
   */
  heroImageKey: z.string().min(1).max(300).nullable().optional(),
  /**
   * One line saying what the academy is, asked for when the academy is set up.
   * Nullable so it can be cleared (see `heroImageKey` above for why omission
   * cannot express removal).
   */
  tagline: z.string().min(1).max(160).nullable().optional(),
  /** Default SEO title for public pages when a SitePage has no seoTitle. */
  metaTitle: z.string().min(1).max(120).optional(),
  /** Default SEO description for public pages when a SitePage has no seoDescription. */
  metaDescription: z.string().min(1).max(320).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #1e293b")
    .default("#0f172a"),
  /**
   * Theme preset applied across this tenant's surfaces (/admin, /c, /t).
   * Must match a `[data-theme]` block in app/themes.css — see lib/theme/presets.
   */
  themePreset: themePresetSchema.default(DEFAULT_THEME_PRESET),
  /**
   * Whether `primaryColor` overrides the preset's --primary.
   *
   * Defaults to FALSE on purpose: every existing tenant carries the schema
   * default `#0f172a`, so defaulting to true would stamp a near-black primary
   * over every tenant's chosen preset the moment this ships.
   */
  themePrimaryOverride: z.boolean().default(false),
  /** Optional custom instruction appended to the footer of tenant emails. */
  emailInstruction: z.string().max(500).optional(),
  timezone: z.string().min(1).max(64).default("UTC"),
  locale: z.string().min(2).max(10).default("en"),
  currency: z.string().length(3).default("NGN"),
  enabledModules: z
    .array(z.enum(MODULE_KEYS))
    .default([...MODULE_KEYS]),
  onboarding: onboardingSchema.optional(),
});

export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

/** Parse stored settings, applying defaults and never throwing. */
export function parseTenantSettings(json: unknown): TenantSettings {
  const result = tenantSettingsSchema.safeParse(
    json && typeof json === "object" ? json : {}
  );
  if (result.success) return result.data;
  // Legacy / malformed: return schema defaults.
  return tenantSettingsSchema.parse({});
}
