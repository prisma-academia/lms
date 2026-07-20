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
  "resources",
  "roles",
  "templates",
  "activity",
  "billing",
  "fees",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

const onboardingSchema = z.object({
  completedAt: z.string().optional(),
  completedSteps: z.array(z.string()).optional(),
  trialReminder7dSentAt: z.string().optional(),
  trialReminder1dSentAt: z.string().optional(),
});

export const tenantSettingsSchema = z.object({
  logoKey: z.string().min(1).max(300).optional(),
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
