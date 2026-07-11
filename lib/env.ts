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

export function billingConfigured(): boolean {
  return paystackConfigured() || flutterwaveConfigured();
}
