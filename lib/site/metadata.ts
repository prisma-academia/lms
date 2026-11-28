import type { Metadata, Viewport } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/client";
import { loadTenantPageContext } from "@/lib/db/page-context";
import { env, isProd } from "@/lib/env";
import { parseTenantSettings, type TenantSettings } from "@/lib/tenant/settings";
import { brandingAssetUrls } from "@/lib/tenant/branding-assets";
import { appScheme } from "@/lib/url/scheme";

export const PRODUCT_TAGLINE =
  "Courses, proctored CBT exams, certificates, an academy website and online payments in one learning management system.";

/** Apex landing-page meta description (~150 characters; see the seo skill). */
export const MARKETING_DESCRIPTION =
  "Run your academy online: courses, proctored CBT exams, certificates, a website builder and Monnify, Paystack or Flutterwave payments in one LMS.";

export const MARKETING_KEYWORDS = [
  "learning management system",
  "LMS",
  "CBT exam software",
  "computer-based testing",
  "online exam platform",
  "online academy",
  "course builder",
  "academy website builder",
  "certificate generator",
  "Paystack",
  "Monnify",
];

export function productDescription(): string {
  return `${env.PRODUCT_NAME} — ${PRODUCT_TAGLINE}`;
}

/** Resolve the public origin for the current request (OG URLs, canonical links). */
export async function requestOrigin(): Promise<URL> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (env.NODE_ENV === "production" ? "https" : "http");
  if (host) return new URL(`${proto}://${host}`);
  return new URL(`${appScheme()}://${env.APP_DOMAIN}`);
}

export type TenantBranding = {
  name: string;
  settings: TenantSettings;
  logoUrl: string | null;
  faviconUrl: string | null;
  icon32Url: string | null;
  apple180Url: string | null;
  og1200Url: string | null;
};

/**
 * Request-deduped: each tenant layout already calls this from both
 * `generateMetadata` and `generateViewport`, and the theme resolver in
 * RootLayout adds another caller. `cache()` collapses them to one query.
 */
export const loadTenantBranding = cache(async function loadTenantBranding(): Promise<TenantBranding | null> {
  const page = await loadTenantPageContext();
  if (page.mode !== "tenant" || !page.tenant) return null;

  const row = await prisma.tenant.findUnique({
    where: { id: page.tenant.id },
    select: { name: true, settingsJson: true },
  });
  if (!row) return null;

  const settings = parseTenantSettings(row.settingsJson);
  const urls = brandingAssetUrls(settings);

  return {
    name: row.name,
    settings,
    logoUrl: urls.logoUrl,
    faviconUrl: urls.faviconUrl,
    icon32Url: urls.icon32Url,
    apple180Url: urls.apple180Url,
    og1200Url: urls.og1200Url,
  };
});

function openGraphImages(
  origin: URL,
  images?: Metadata["openGraph"] extends { images?: infer I } ? I : never
) {
  return images ?? [{ url: new URL("/opengraph-image", origin) }];
}

export function buildPlatformMetadata(origin: URL): Metadata {
  const title = env.PRODUCT_NAME;
  const description = productDescription();

  return {
    metadataBase: origin,
    title: {
      default: title,
      template: `%s · ${title}`,
    },
    description,
    applicationName: title,
    creator: title,
    publisher: title,
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    robots: isProd
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: env.DEFAULT_LOCALE,
      url: origin,
      siteName: title,
      title,
      description,
      images: openGraphImages(origin),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [new URL("/opengraph-image", origin).toString()],
    },
    alternates: {
      canonical: origin.pathname === "/" ? origin : undefined,
    },
  };
}

export type TenantMetadataContext = "public" | "learner" | "admin";

const TENANT_COPY: Record<TenantMetadataContext, (name: string) => string> = {
  public: (name) =>
    `Welcome to ${name} — explore courses, programmes, and start learning online.`,
  learner: (name) =>
    `Your learning portal at ${name} — courses, assignments, certificates, and progress tracking.`,
  admin: (name) =>
    `Manage ${name} — courses, learners, billing, and organization settings.`,
};

export function buildTenantMetadata(
  origin: URL,
  branding: TenantBranding,
  context: TenantMetadataContext,
  pageSeo?: { title?: string | null; description?: string | null; ogImageUrl?: string | null }
): Metadata {
  const { name, settings } = branding;
  const title =
    pageSeo?.title?.trim() ||
    settings.metaTitle?.trim() ||
    name;
  const description =
    pageSeo?.description?.trim() ||
    settings.metaDescription?.trim() ||
    TENANT_COPY[context](name);

  const ogUrl =
    pageSeo?.ogImageUrl ||
    branding.og1200Url ||
    branding.logoUrl;
  const images = ogUrl
    ? [{ url: ogUrl, alt: title }]
    : openGraphImages(origin);

  const iconUrl = branding.icon32Url ?? branding.faviconUrl ?? branding.logoUrl;
  const appleUrl = branding.apple180Url ?? branding.faviconUrl ?? branding.logoUrl;

  return {
    metadataBase: origin,
    title: {
      default: title,
      template: `%s · ${name}`,
    },
    description,
    applicationName: name,
    robots:
      context === "public"
        ? isProd
          ? { index: true, follow: true }
          : { index: false, follow: false }
        : { index: false, follow: false },
    icons: iconUrl
      ? {
          icon: [{ url: iconUrl }],
          apple: appleUrl ? [{ url: appleUrl }] : undefined,
        }
      : undefined,
    openGraph: {
      type: "website",
      locale: settings.locale,
      siteName: name,
      title,
      description,
      images,
    },
    twitter: {
      card: branding.og1200Url || pageSeo?.ogImageUrl ? "summary_large_image" : iconUrl ? "summary" : "summary_large_image",
      title,
      description,
      images: ogUrl
        ? [ogUrl]
        : [new URL("/opengraph-image", origin).toString()],
    },
  };
}

export function buildPlatformViewport(): Viewport {
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: "#faf1e4",
    colorScheme: "light",
  };
}

export function buildTenantViewport(settings: TenantSettings): Viewport {
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: settings.primaryColor,
    colorScheme: "light",
  };
}
