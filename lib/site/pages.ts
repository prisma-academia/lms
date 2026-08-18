import { prisma } from "@/lib/db/client";
import { classicHomeHtml } from "@/lib/site/page-templates";

export type SitePageRow = {
  id: string;
  slug: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  isHome: boolean;
  showInNav: boolean;
  navOrder: number;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageKey: string | null;
  /** The page document. Contains unresolved {{ variables }}. */
  htmlSource: string;
  includeShell: boolean;
};

/** Ensure a published home page exists (Classic template). Idempotent. */
export async function ensureHomeSitePage(tenantId: string): Promise<SitePageRow> {
  const existing = await prisma.sitePage.findFirst({
    where: { tenantId, isHome: true },
  });
  if (existing) return toRow(existing);

  const bySlug = await prisma.sitePage.findUnique({
    where: { tenantId_slug: { tenantId, slug: "" } },
  });
  if (bySlug) {
    const updated = await prisma.sitePage.update({
      where: { id: bySlug.id },
      data: { isHome: true, status: "PUBLISHED" },
    });
    return toRow(updated);
  }

  const created = await prisma.sitePage.create({
    data: {
      tenantId,
      slug: "",
      title: "Home",
      status: "PUBLISHED",
      isHome: true,
      showInNav: true,
      navOrder: 0,
      htmlSource: classicHomeHtml(),
    },
  });
  return toRow(created);
}

export function toRow(page: {
  id: string;
  slug: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  isHome: boolean;
  showInNav: boolean;
  navOrder: number;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageKey: string | null;
  htmlSource: string;
  includeShell: boolean;
}): SitePageRow {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    status: page.status,
    isHome: page.isHome,
    showInNav: page.showInNav,
    navOrder: page.navOrder,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    ogImageKey: page.ogImageKey,
    htmlSource: page.htmlSource,
    includeShell: page.includeShell,
  };
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Paths reserved for the learner / admin apps — not CMS slugs. */
export const RESERVED_SITE_SLUGS = new Set([
  "admin",
  "auth",
  "api",
  "dashboard",
  "courses",
  "programmes",
  "library",
  "certificates",
  "profile",
  "calendar",
  "grades",
  "notifications",
  "my-courses",
  "inbox",
  "assignments",
  "t",
  "c",
  "m",
  "maintenance",
  "not-found",
  "unknown-tenant",
  "_next",
]);

export function isReservedSlug(slug: string): boolean {
  const first = slug.split("/")[0] ?? "";
  return RESERVED_SITE_SLUGS.has(first);
}
