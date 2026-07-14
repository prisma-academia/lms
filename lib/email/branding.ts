import { rawPrisma } from "@/lib/db/raw-client";
import { env, isProd } from "@/lib/env";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";

/**
 * Resolved branding used to render a tenant-aware email. Deliberately free of
 * any request-scoped dependency (`next/headers`) so it works in background jobs
 * (`lib/jobs/*`) as well as request handlers. Callers fetch the tenant however
 * they need (extended prisma in requests, `lib/db/raw-client` in jobs) and pass
 * the row in.
 */
export type EmailBranding = {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  /** Absolute URL to the tenant's site / login (clickable in emails). */
  siteUrl: string;
  /** Absolute origin of the app for this tenant (for in-app deep links). */
  appOrigin: string;
  /** Where replies should go; also shown as the contact address. */
  supportEmail: string;
  supportPhone: string | null;
  address: string | null;
  /** Optional custom instruction from the tenant, shown in the footer. */
  instruction: string | null;
  isPlatform: boolean;
};

/** Minimal set of `Tenant` columns needed to build branding. */
export type TenantBrandingInput = {
  name: string;
  slug: string;
  companyEmail?: string | null;
  companyPhone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  settingsJson: unknown;
};

/** The columns to select when loading a tenant for email branding. */
export const TENANT_BRANDING_SELECT = {
  name: true,
  slug: true,
  companyEmail: true,
  companyPhone: true,
  website: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  region: true,
  postalCode: true,
  country: true,
  settingsJson: true,
} as const;

function proto(): string {
  return isProd ? "https" : "http";
}

/** Format minor units (cents) as a currency label, e.g. "NGN 5,000.00". */
export function formatMoney(cents: number, currency: string): string {
  const amount = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${amount}`;
}

/** Absolute tenant origin, e.g. https://acme.example.com */
export function tenantOrigin(slug: string): string {
  return `${proto()}://${slug}.${env.APP_DOMAIN}`;
}

/** Absolute platform (apex) origin, e.g. https://example.com */
export function platformOrigin(): string {
  return `${proto()}://${env.APP_DOMAIN}`;
}

function formatAddress(t: TenantBrandingInput): string | null {
  const parts = [
    t.addressLine1,
    t.addressLine2,
    t.city,
    t.region,
    t.postalCode,
    t.country,
  ].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length ? parts.join(", ") : null;
}

/** Build branding for a tenant email from an already-loaded tenant row. */
export function tenantBranding(t: TenantBrandingInput): EmailBranding {
  const settings = parseTenantSettings(t.settingsJson);
  const logoUrl =
    settings.logoKey && s3Configured() ? publicUrlForKey(settings.logoKey) : null;
  return {
    name: t.name,
    logoUrl,
    primaryColor: settings.primaryColor,
    siteUrl: t.website?.trim() || tenantOrigin(t.slug),
    appOrigin: tenantOrigin(t.slug),
    supportEmail: t.companyEmail?.trim() || env.EMAIL_FROM,
    supportPhone: t.companyPhone?.trim() || null,
    address: formatAddress(t),
    instruction: settings.emailInstruction?.trim() || null,
    isPlatform: false,
  };
}

/**
 * Load branding for a tenant by id. Uses the un-extended raw client so it works
 * in request handlers and background jobs alike (it reads only the tenant's own
 * public branding). Falls back to platform branding if the tenant is missing.
 */
export async function loadTenantBrandingById(
  tenantId: string | null | undefined
): Promise<EmailBranding> {
  if (!tenantId) return platformBranding();
  const row = await rawPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: TENANT_BRANDING_SELECT,
  });
  return row ? tenantBranding(row) : platformBranding();
}

/** Branding for platform-level emails (no tenant context). */
export function platformBranding(): EmailBranding {
  return {
    name: env.PRODUCT_NAME,
    logoUrl: null,
    primaryColor: "#0f172a",
    siteUrl: platformOrigin(),
    appOrigin: platformOrigin(),
    supportEmail: env.EMAIL_FROM,
    supportPhone: null,
    address: null,
    instruction: null,
    isPlatform: true,
  };
}
