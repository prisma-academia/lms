import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.url(),
  APP_DOMAIN: z.string().min(1),
  PLATFORM_SUBDOMAIN: z.string().min(1).default("platform"),
  SESSION_SECRET: z.string().min(16),
  OTP_PEPPER: z.string().min(8),
  PLATFORM_ADMIN_EMAIL: z.email(),
  PLATFORM_ADMIN_PASSWORD: z.string().min(12),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  EMAIL_FROM: z.email(),
  EMAIL_FROM_NAME: z.string().min(1),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  // Rate limiting (Upstash). Optional: when unset, limiter fails open.
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  RATE_LIMIT_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  // Object storage (S3 / S3-compatible, e.g. MinIO) for tenant branding assets.
  // For MinIO/self-hosted: set S3_ENDPOINT (e.g. http://localhost:9000).
  // S3_REGION is optional when S3_ENDPOINT is set (defaults to us-east-1).
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_ENDPOINT: z.url().optional(),
  S3_PUBLIC_BASE_URL: z.url().optional(),
  // Path-style addressing (bucket in path, not subdomain). Required by MinIO
  // and most self-hosted gateways. Defaults to true whenever S3_ENDPOINT is set.
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => (v == null ? undefined : v !== "false")),
  // i18n
  DEFAULT_LOCALE: z.string().min(2).default("en"),
  SUPPORTED_LOCALES: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "en")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  PRODUCT_NAME: z.string().min(1).default("Prisma LMS"),
  TENANT_TRIAL_DAYS: z.coerce.number().int().positive().default(90),
  PLATFORM_COMMISSION_PCT: z.coerce.number().int().min(0).max(100).default(10),
  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
  PAYSTACK_PUBLIC_KEY: z.string().min(1).optional(),
  FLUTTERWAVE_SECRET_KEY: z.string().min(1).optional(),
  FLUTTERWAVE_PUBLIC_KEY: z.string().min(1).optional(),
  FLUTTERWAVE_SECRET_HASH: z.string().min(1).optional(),
  // Monnify: one of the gateways, usable whenever all three keys are present
  // (and MONNIFY_ENABLED is not "false").
  MONNIFY_API_KEY: z.string().min(1).optional(),
  MONNIFY_SECRET_KEY: z.string().min(1).optional(),
  MONNIFY_CONTRACT_CODE: z.string().min(1).optional(),
  MONNIFY_BASE_URL: z.url().default("https://sandbox.monnify.com"),
  /** "false" switches Monnify off without removing its keys. */
  MONNIFY_ENABLED: z.string().optional(),
  /** Informational: "sandbox" or "live". The URL above is what is actually called. */
  MONNIFY_ENV: z.string().optional(),
  /** The merchant wallet, for disbursements. Not used by collections. */
  MONNIFY_WALLET_ACCOUNT_NUMBER: z.string().optional(),
  /** Comma-separated addresses Monnify's webhooks may come from. Empty = any (signature still required). */
  MONNIFY_CALLBACK_IPS: z.string().optional(),
  /**
   * Which gateway takes NEW checkouts: MONNIFY, PAYSTACK or FLUTTERWAVE.
   * Unset = the first one that is configured, in that order.
   */
  PAYMENT_PROVIDER: z.string().optional(),
  // AI. Optional: features report "not set up" rather than failing when absent.
  // The model id and key lookup live in `lib/ai/config.ts`, which Mastra code
  // imports without this module (so `mastra dev` does not need the full env).
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(3).optional(),
  // Encryption at rest for webhook / integration secrets (lib/crypto/secret-box.ts).
  // 32 random bytes, base64. Optional so the app boots without it; anything that
  // needs it fails with a clear message instead.
  APP_ENCRYPTION_KEY: z.string().min(1).optional(),
  // Integrations hub: the PLATFORM's Google OAuth client (Google Calendar + Meet).
  // Redirect URI to register: https://<APP_DOMAIN>/api/integrations/google/callback
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === "production";

export function apexHostname(): string {
  return env.APP_DOMAIN.split(":")[0];
}

export function platformHostname(): string {
  return `${env.PLATFORM_SUBDOMAIN}.${apexHostname()}`;
}

export function paystackConfigured(): boolean {
  return Boolean(env.PAYSTACK_SECRET_KEY && env.PAYSTACK_PUBLIC_KEY);
}

export function flutterwaveConfigured(): boolean {
  return Boolean(env.FLUTTERWAVE_SECRET_KEY && env.FLUTTERWAVE_PUBLIC_KEY);
}

export function monnifyConfigured(): boolean {
  if ((env.MONNIFY_ENABLED ?? "").trim().toLowerCase() === "false") return false;
  return Boolean(env.MONNIFY_API_KEY && env.MONNIFY_SECRET_KEY && env.MONNIFY_CONTRACT_CODE);
}

export function billingConfigured(): boolean {
  return monnifyConfigured() || paystackConfigured() || flutterwaveConfigured();
}
