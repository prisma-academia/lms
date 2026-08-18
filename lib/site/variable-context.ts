import { prisma } from "@/lib/db/client";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { brandingAssetUrls } from "@/lib/tenant/branding-assets";
import {
  formatCoursePrice,
  formatTenantAddress,
  formatTenantLocation,
} from "@/lib/tenant/landing";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";
import { readSessionToken, getSession } from "@/lib/auth/session";
import type { VariableContext } from "@/lib/site/template";
import { AUTH_VARIABLE_PREFIXES } from "@/lib/site/variables";

/**
 * Resolve the `{{ }}` variables a site page can reference.
 *
 * Server-only — this is the half of the variable system that touches the
 * database. The catalog it fills in lives in `variables.ts`, which stays
 * client-safe so the editor's autocomplete can import it.
 *
 * Everything here is driven by `used`, the set of paths the page actually
 * references. A page that never writes `{{#each programmes}}` must not pay for
 * a programmes query on every request, and — more importantly — a page that
 * never mentions `progress.*` must not resolve a session, because doing so is
 * what would force it out of the cache.
 */

export type SiteViewer = {
  isAuthenticated: boolean;
  clientId: string | null;
  name: string;
  email: string;
};

const ANONYMOUS: SiteViewer = {
  isAuthenticated: false,
  clientId: null,
  name: "",
  email: "",
};

function usesAny(used: string[], prefixes: readonly string[]): boolean {
  return used.some((path) =>
    prefixes.some((prefix) => {
      const root = prefix.replace(/\.$/, "");
      return path === root || path.startsWith(`${root}.`);
    })
  );
}

function imageUrl(key: string | null): string {
  return key && s3Configured() ? publicUrlForKey(key) : "";
}

/**
 * Read the learner session without redirecting.
 *
 * Deliberately not `requireClientPage` — that redirects to the login screen,
 * which on a public marketing page would bounce every anonymous visitor away
 * from the site they came to read. An unauthenticated viewer here is the normal
 * case, not an error.
 */
export async function resolveSiteViewer(tenantId: string): Promise<SiteViewer> {
  try {
    const token = await readSessionToken("CLIENT");
    const session = await getSession(token);
    if (!session || session.tenantId !== tenantId) return ANONYMOUS;

    const client = await prisma.client.findFirst({
      where: { id: session.userId, tenantId, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!client) return ANONYMOUS;

    const name = [client.firstName, client.lastName]
      .filter((p) => p?.trim())
      .join(" ")
      .trim();

    return {
      isAuthenticated: true,
      clientId: client.id,
      name: name || client.email,
      email: client.email,
    };
  } catch {
    // A page must still render if the session store is unhappy.
    return ANONYMOUS;
  }
}

async function loadCourses(tenantId: string, limit: number) {
  const rows = await prisma.course.findMany({
    where: { tenantId, status: "PUBLISHED", visibility: "PUBLIC" },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      priceCents: true,
      currency: true,
      thumbnailKey: true,
      _count: { select: { lessons: true } },
    },
  });

  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    description: c.description ?? "",
    url: `/courses/${c.slug}`,
    price: formatCoursePrice(c.priceCents, c.currency),
    priceCents: c.priceCents ?? 0,
    thumbnailUrl: imageUrl(c.thumbnailKey),
    lessonCount: c._count.lessons,
  }));
}

async function loadProgrammes(tenantId: string, limit: number) {
  const rows = await prisma.programme.findMany({
    where: { tenantId, status: "PUBLISHED", visibility: "PUBLIC" },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      priceCents: true,
      currency: true,
      thumbnailKey: true,
      _count: { select: { courses: true } },
    },
  });

  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description ?? "",
    url: `/programmes/${p.slug}`,
    price: formatCoursePrice(p.priceCents, p.currency),
    priceCents: p.priceCents ?? 0,
    thumbnailUrl: imageUrl(p.thumbnailKey),
    courseCount: p._count.courses,
  }));
}

async function loadProgress(tenantId: string, clientId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId, clientId },
    orderBy: { enrolledAt: "desc" },
    take: 50,
    select: {
      progressPercent: true,
      completedAt: true,
      course: { select: { title: true, slug: true } },
    },
  });

  const rows = enrollments.map((e) => ({
    courseTitle: e.course?.title ?? "",
    url: e.course?.slug ? `/courses/${e.course.slug}` : "",
    percent: e.progressPercent,
    completed: e.completedAt !== null,
  }));

  const completedCount = rows.filter((r) => r.completed).length;
  const averagePercent =
    rows.length === 0
      ? 0
      : Math.round(rows.reduce((sum, r) => sum + r.percent, 0) / rows.length);

  return {
    enrollmentCount: rows.length,
    completedCount,
    averagePercent,
    enrollments: rows,
  };
}

export type TenantFacts = {
  name: string;
  companyEmail: string | null;
  companyPhone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  settingsJson: unknown;
};

export async function buildVariableContext(input: {
  tenantId: string;
  tenant: TenantFacts;
  page: { title: string; slug: string };
  origin: string;
  /** Paths the document references, from `usedVariables()`. */
  used: string[];
  /** Pass a resolved viewer, or leave undefined to resolve on demand. */
  viewer?: SiteViewer;
  /** Cap on catalog rows. Matches the old `courses` block ceiling. */
  limit?: number;
}): Promise<VariableContext> {
  const { tenantId, tenant, page, origin, used } = input;
  const limit = input.limit ?? 24;

  const settings = parseTenantSettings(tenant.settingsJson);
  const urls = brandingAssetUrls(settings);

  const ctx: VariableContext = {
    tenant: {
      name: tenant.name,
      logoUrl: urls.logoUrl ?? "",
      email: tenant.companyEmail ?? "",
      phone: tenant.companyPhone ?? "",
      website: tenant.website ?? "",
      location: formatTenantLocation(tenant.city, tenant.country, settings.locale) ?? "",
      address: formatTenantAddress(
        {
          addressLine1: tenant.addressLine1,
          addressLine2: tenant.addressLine2,
          city: tenant.city,
          region: tenant.region,
          postalCode: tenant.postalCode,
          country: tenant.country,
        },
        settings.locale
      ).join(", "),
      city: tenant.city ?? "",
      country: tenant.country ?? "",
      primaryColor: settings.primaryColor,
    },
    site: {
      title: page.title,
      slug: page.slug,
      year: new Date().getFullYear(),
      origin,
    },
    courses: [],
    programmes: [],
    user: { isAuthenticated: false, name: "", email: "" },
    progress: {
      enrollmentCount: 0,
      completedCount: 0,
      averagePercent: 0,
      enrollments: [],
    },
  };

  if (usesAny(used, ["courses"])) {
    ctx.courses = await loadCourses(tenantId, limit);
  }
  if (usesAny(used, ["programmes"])) {
    ctx.programmes = await loadProgrammes(tenantId, limit);
  }

  if (usesAny(used, AUTH_VARIABLE_PREFIXES)) {
    const viewer = input.viewer ?? (await resolveSiteViewer(tenantId));
    ctx.user = {
      isAuthenticated: viewer.isAuthenticated,
      name: viewer.name,
      email: viewer.email,
    };
    if (viewer.clientId) {
      ctx.progress = await loadProgress(tenantId, viewer.clientId);
    }
  }

  return ctx;
}
