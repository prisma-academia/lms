import { prisma } from "@/lib/db/client";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { brandingAssetUrls } from "@/lib/tenant/branding-assets";
import {
  formatTenantAddress,
  formatTenantLocation,
} from "@/lib/tenant/landing";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";
import { ensureHomeSitePage, toRow } from "@/lib/site/pages";
import { classicHomeBlocks } from "@/lib/site/page-templates";
import type { SiteBlock } from "@/lib/site/blocks";
import { TenantLandingShell } from "@/components/tenant/landing-shell";
import {
  SiteBlocksRenderer,
  type SiteRenderContext,
} from "@/components/tenant/site-blocks-renderer";
import type { LandingCourse } from "@/components/tenant/landing-courses";

async function loadCourses(limit: number): Promise<LandingCourse[]> {
  const courses = await prisma.course.findMany({
    where: { status: "PUBLISHED", visibility: "PUBLIC" },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      description: true,
      priceCents: true,
      currency: true,
      thumbnailKey: true,
      _count: { select: { lessons: true } },
    },
  });
  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    priceCents: c.priceCents,
    currency: c.currency,
    thumbnailUrl:
      c.thumbnailKey && s3Configured() ? publicUrlForKey(c.thumbnailKey) : null,
    lessonCount: c._count.lessons,
  }));
}

function coursesLimitFromBlocks(blocks: SiteBlock[]): number {
  let max = 6;
  for (const b of blocks) {
    if (b.type === "courses") max = Math.max(max, b.limit);
  }
  return max;
}

export async function renderTenantSitePage(opts: {
  tenantId: string;
  /** null = home. Ignored when `pageId` is set. */
  slug: string | null;
  /**
   * Render one specific page by id, published or not. Only the admin preview
   * route passes this, and only behind TENANT_SITE_READ — the public routes go
   * through `slug`, which keeps its `status: PUBLISHED` filter. Keeping the
   * draft escape hatch on a separate parameter is what stops a future caller
   * from accidentally widening the public path.
   */
  pageId?: string;
}) {
  const row = await prisma.tenant.findUnique({
    where: { id: opts.tenantId },
    select: {
      name: true,
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
    },
  });
  if (!row) return null;

  let page;
  if (opts.pageId) {
    const found = await prisma.sitePage.findFirst({
      where: { id: opts.pageId, tenantId: opts.tenantId },
    });
    if (!found) return null;
    page = toRow(found);
  } else if (opts.slug === null || opts.slug === "") {
    page = await ensureHomeSitePage(opts.tenantId);
  } else {
    const found = await prisma.sitePage.findFirst({
      where: {
        tenantId: opts.tenantId,
        slug: opts.slug,
        status: "PUBLISHED",
      },
    });
    if (!found) return null;
    page = toRow(found);
  }

  const blocks = page.blocks.length > 0 ? page.blocks : classicHomeBlocks();
  const settings = parseTenantSettings(row.settingsJson);
  const urls = brandingAssetUrls(settings);
  const location = formatTenantLocation(row.city, row.country, settings.locale);
  const addressLines = formatTenantAddress(
    {
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      region: row.region,
      postalCode: row.postalCode,
      country: row.country,
    },
    settings.locale
  );

  const courses = await loadCourses(coursesLimitFromBlocks(blocks));

  const navPages = await prisma.sitePage.findMany({
    where: {
      tenantId: opts.tenantId,
      status: "PUBLISHED",
      showInNav: true,
      isHome: false,
    },
    orderBy: { navOrder: "asc" },
    select: { slug: true, title: true },
  });

  const ctx: SiteRenderContext = {
    orgName: row.name,
    logoUrl: urls.logoUrl,
    location,
    companyEmail: row.companyEmail,
    companyPhone: row.companyPhone,
    website: row.website,
    addressLines,
    courses,
  };

  return {
    page,
    settings,
    urls,
    element: (
      <TenantLandingShell
        orgName={row.name}
        logoUrl={urls.logoUrl}
        navLinks={navPages.map((p) => ({
          href: `/${p.slug}`,
          label: p.title,
        }))}
      >
        <main>
          <SiteBlocksRenderer blocks={blocks} ctx={ctx} />
        </main>
      </TenantLandingShell>
    ),
  };
}
