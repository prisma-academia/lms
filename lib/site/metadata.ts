import type { Metadata, Viewport } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/client";
import { loadTenantPageContext } from "@/lib/db/page-context";
import { env, isProd } from "@/lib/env";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";
import { parseTenantSettings, type TenantSettings } from "@/lib/tenant/settings";

export const PRODUCT_TAGLINE =
  "Deliver learning content, assess learners, keep everyone engaged, and manage your organization with built-in billing.";

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
  return new URL(`http://${env.APP_DOMAIN}`);
}

export type TenantBranding = {
  name: string;
  settings: TenantSettings;
  logoUrl: string | null;
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
  const logoUrl =
    settings.logoKey && s3Configured()
      ? publicUrlForKey(settings.logoKey)
      : null;

  return { name: row.name, settings, logoUrl };
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
  context: TenantMetadataContext
): Metadata {
  const { name, settings, logoUrl } = branding;
  const description = TENANT_COPY[context](name);
  const images = logoUrl
    ? [{ url: logoUrl, alt: name }]
    : openGraphImages(origin);

  return {
    metadataBase: origin,
    title: {
      default: name,
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
    icons: logoUrl
      ? {
          icon: [{ url: logoUrl }],
          apple: [{ url: logoUrl }],
        }
      : undefined,
    openGraph: {
      type: "website",
      locale: settings.locale,
      siteName: name,
      title: name,
      description,
      images,
    },
    twitter: {
      card: logoUrl ? "summary" : "summary_large_image",
      title: name,
      description,
      images: logoUrl ? [logoUrl] : [new URL("/opengraph-image", origin).toString()],
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
