/**
 * Which model the AI features use, and whether they can run at all.
 *
 * This file must stay dependency-free and read `process.env` directly. The
 * Mastra agents import it RELATIVELY (`../../../lib/ai/config`) so that
 * `mastra dev` / `mastra build` never depend on tsconfig path aliases or on the
 * full environment validation in `lib/env.ts` — the same constraint the schema
 * modules under `lib/schemas/` already follow.
 */

/**
 * Mastra model-router id, `provider/model`. Claude Sonnet 5 on Anthropic's own
 * API. Override with `AI_MODEL` (for example `openrouter/anthropic/claude-sonnet-5`).
 */
export const DEFAULT_AI_MODEL = "anthropic/claude-sonnet-5";

/** The environment variable each provider's key is read from. */
const PROVIDER_KEY_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

export function aiModel(): string {
  const configured = process.env.AI_MODEL?.trim();
  return configured && configured.includes("/") ? configured : DEFAULT_AI_MODEL;
}

export function aiProvider(): string {
  return aiModel().split("/")[0].toLowerCase();
}

/** Name of the variable that must hold the key for the configured provider. */
export function aiKeyEnvVar(): string {
  const provider = aiProvider();
  return PROVIDER_KEY_ENV[provider] ?? `${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}

export type AiStatus = {
  /** False when the provider key is missing: nothing AI can run. */
  configured: boolean;
  model: string;
  provider: string;
  /** Which variable to set. Safe to show to staff; it is a name, not a value. */
  keyEnvVar: string;
};

/**
 * Cheap, synchronous, no network. Call it before starting any AI work so a
 * missing key is reported as "AI is not set up" rather than discovered as an
 * opaque failure halfway through a generation.
 */
export function aiStatus(): AiStatus {
  const keyEnvVar = aiKeyEnvVar();
  return {
    configured: Boolean(process.env[keyEnvVar]?.trim()),
    model: aiModel(),
    provider: aiProvider(),
    keyEnvVar,
  };
}
