import { cache } from "react";
import { prisma } from "@/lib/db/client";
import { headers } from "next/headers";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { brandingAssetUrls } from "@/lib/tenant/branding-assets";
import { ensureHomeSitePage, toRow, type SitePageRow } from "@/lib/site/pages";
import { classicHomeHtml } from "@/lib/site/page-templates";
import { renderCssTemplate, renderTemplate, usedVariables } from "@/lib/site/template";
import { buildVariableContext } from "@/lib/site/variable-context";
import { sanitizeSiteDocument } from "@/lib/content/sanitize-site-document";
import { TenantLandingShell } from "@/components/tenant/landing-shell";

/**
 * Render one tenant site page.
 *
 * A page is now a single HTML document the tenant authored, not a block tree.
 * The pipeline is fixed and the order matters:
 *
 *   htmlSource -> renderTemplate (escapes data) -> sanitizeSiteDocument -> DOM
 *
 * Interpolating BEFORE sanitizing is deliberate. Sanitizing first would run the
 * URL scheme checks against the literal `{{ tenant.website }}`, which is not a
 * valid scheme, so every templated `href` would silently lose its link. Going
 * the other way is safe because `renderTemplate` HTML-escapes every substituted
 * value, so data can never turn into markup before the sanitizer sees it — the
 * sanitizer's job here is the author's markup, not the data.
 *
 * This is the single renderer behind both the public routes and the admin
 * preview, so what an admin previews cannot drift from what a visitor receives.
 */

export type RenderedSitePage = {
  page: SitePageRow;
  settings: ReturnType<typeof parseTenantSettings>;
  urls: ReturnType<typeof brandingAssetUrls>;
  /** SEO fallbacks lifted from the document's own <head>. */
  headTitle: string | null;
  headDescription: string | null;
  element: React.ReactElement;
};

async function currentOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return "";
    const proto = h.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  } catch {
    return "";
  }
}

async function loadPage(opts: {
  tenantId: string;
  slug: string | null;
  pageId?: string;
}): Promise<SitePageRow | null> {
  if (opts.pageId) {
    const found = await prisma.sitePage.findFirst({
      where: { id: opts.pageId, tenantId: opts.tenantId },
    });
    return found ? toRow(found) : null;
  }

  if (opts.slug === null || opts.slug === "") {
    return ensureHomeSitePage(opts.tenantId);
  }

  const found = await prisma.sitePage.findFirst({
    where: { tenantId: opts.tenantId, slug: opts.slug, status: "PUBLISHED" },
  });
  return found ? toRow(found) : null;
}

async function render(opts: {
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
}): Promise<RenderedSitePage | null> {
  const tenant = await prisma.tenant.findUnique({
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
  if (!tenant) return null;

  const page = await loadPage(opts);
  if (!page) return null;

  // A page that has never been edited still has to render as something. The
  // Classic starter is what `ensureHomeSitePage` seeds, so falling back to it
  // keeps an empty page looking like a new site rather than a broken one.
  const source = page.htmlSource.trim().length > 0 ? page.htmlSource : classicHomeHtml();

  const settings = parseTenantSettings(tenant.settingsJson);
  const urls = brandingAssetUrls(settings);

  const used = usedVariables(source);
  const ctx = await buildVariableContext({
    tenantId: opts.tenantId,
    tenant,
    page: { title: page.title, slug: page.slug },
    origin: await currentOrigin(),
    used,
  });

  const interpolated = renderTemplate(source, ctx);
  const doc = sanitizeSiteDocument(interpolated, `sp-${page.id}`);
  // Author CSS is templated too, so a stylesheet can use the brand colour.
  const css = doc.css ? renderCssTemplate(doc.css, ctx) : "";

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

  const body = (
    <>
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <div
        data-css-scope={doc.scope}
        style={{ ["--sb-brand" as string]: settings.primaryColor }}
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />
    </>
  );

  return {
    page,
    settings,
    urls,
    headTitle: doc.headTitle,
    headDescription: doc.headDescription,
    element: page.includeShell ? (
      <TenantLandingShell
        orgName={tenant.name}
        logoUrl={urls.logoUrl}
        navLinks={navPages.map((p) => ({ href: `/${p.slug}`, label: p.title }))}
      >
        <main>{body}</main>
      </TenantLandingShell>
    ) : (
      <main>{body}</main>
    ),
  };
}

/**
 * Request-scoped memoization.
 *
 * The public routes call this twice per request — once in `generateMetadata`
 * for the title and description, once for the page itself. That was already
 * two full renders; now that each one runs a template engine, a sanitizer and
 * the catalog queries, paying for it twice is no longer merely wasteful.
 */
export const renderTenantSitePage = cache(render);
