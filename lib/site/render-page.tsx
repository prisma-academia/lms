import { cache } from "react";
import { prisma } from "@/lib/db/client";
import { headers } from "next/headers";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { brandingAssetUrls } from "@/lib/tenant/branding-assets";
import { ensureHomeSitePage, toRow, type SitePageRow } from "@/lib/site/pages";
import { classicHomeHtml } from "@/lib/site/page-templates";
import { renderCssTemplate, renderTemplate, usedVariables } from "@/lib/site/template";
import { buildVariableContext, resolveSiteViewer, type TenantFacts } from "@/lib/site/variable-context";
import { sanitizeSiteDocument } from "@/lib/content/sanitize-site-document";
import { findPageKind, pageKindProblems, type SitePageKind } from "@/lib/site/site-api";
import {
  getPublicCourse,
  getPublicProgramme,
  listPublicCourses,
  listPublicProgrammes,
  type PublicCourse,
  type PublicProgramme,
} from "@/lib/site/public-catalog";
import { authHref } from "@/lib/auth/next-path";
import { TenantLandingShell } from "@/components/tenant/landing-shell";
import { SiteRuntime } from "@/components/site/site-runtime";

/**
 * Render one tenant site page.
 *
 * A page is a single HTML document the tenant authored, not a block tree.
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
 * The header and footer go through the same pipeline when the academy has
 * written its own (`SiteLayout`); otherwise the built-in ones are used.
 *
 * This is the single renderer behind the public routes, the designed sign-in
 * and catalogue pages, and the admin preview, so what an admin previews cannot
 * drift from what a visitor receives.
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

const TENANT_FIELDS = {
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
} as const;

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

type RenderOptions = {
  tenantId: string;
  /** null = home. Ignored when `pageId` or `kind` is set. */
  slug: string | null;
  /**
   * Render one specific page by id, published or not. Only the admin preview
   * route passes this, and only behind TENANT_SITE_READ — the public routes go
   * through `slug` or `kind`, which keep their `status: PUBLISHED` filter.
   * Keeping the draft escape hatch on a separate parameter is what stops a
   * future caller from accidentally widening the public path.
   */
  pageId?: string;
  /**
   * Render the academy's published page of a special kind (its sign-in page,
   * its catalogue…). Resolves to null — "use the standard screen" — when there
   * is none, or when the one there is does not pass `pageKindProblems`.
   */
  kind?: Exclude<SitePageKind, "PAGE">;
  /** Where the sign-in / register links and forms should return the visitor to. */
  next?: string | null;
  /** The catalogue page's search text. */
  query?: string | null;
  /** The course or programme a detail page is showing. */
  course?: PublicCourse | null;
  programme?: PublicProgramme | null;
  /** The visitor's referral code, for a designed register page. */
  referralCode?: string | null;
};

async function loadPage(opts: RenderOptions): Promise<SitePageRow | null> {
  if (opts.pageId) {
    const found = await prisma.sitePage.findFirst({
      where: { id: opts.pageId, tenantId: opts.tenantId },
    });
    return found ? toRow(found) : null;
  }

  if (opts.kind) {
    const found = await prisma.sitePage.findFirst({
      where: { tenantId: opts.tenantId, kind: opts.kind, status: "PUBLISHED" },
    });
    return found ? toRow(found) : null;
  }

  if (opts.slug === null || opts.slug === "") {
    return ensureHomeSitePage(opts.tenantId);
  }

  const found = await prisma.sitePage.findFirst({
    // `kind: PAGE`: a designed sign-in page is served at /auth/login, not at
    // the slug it happens to be stored under.
    where: { tenantId: opts.tenantId, slug: opts.slug, status: "PUBLISHED", kind: "PAGE" },
  });
  return found ? toRow(found) : null;
}

/** One author document through the pipeline. */
function renderDocument(source: string, id: string, kind: SitePageKind, ctx: Awaited<ReturnType<typeof buildVariableContext>>) {
  const doc = sanitizeSiteDocument(renderTemplate(source, ctx), id, { kind });
  // Author CSS is templated too, so a stylesheet can use the brand colour.
  return { doc, css: doc.css ? renderCssTemplate(doc.css, ctx) : "" };
}

function Fragmented({
  css,
  scope,
  html,
  brand,
  as: Tag = "div",
}: {
  css: string;
  scope: string;
  html: string;
  brand: string;
  as?: "div" | "header" | "footer";
}) {
  return (
    <>
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <Tag
        data-css-scope={scope}
        style={{ ["--sb-brand" as string]: brand }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

async function render(opts: RenderOptions): Promise<RenderedSitePage | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: opts.tenantId },
    select: TENANT_FIELDS,
  });
  if (!tenant) return null;

  const page = await loadPage(opts);
  if (!page) return null;
  const kind = findPageKind(page.kind).kind;

  // A page that has never been edited still has to render as something. The
  // Classic starter is what `ensureHomeSitePage` seeds, so falling back to it
  // keeps an empty page looking like a new site rather than a broken one.
  const source = page.htmlSource.trim().length > 0 ? page.htmlSource : classicHomeHtml();

  const settings = parseTenantSettings(tenant.settingsJson);
  const urls = brandingAssetUrls(settings);

  const layout = page.includeShell
    ? await prisma.siteLayout.findUnique({
        where: { tenantId: opts.tenantId },
        select: { headerHtml: true, footerHtml: true, sharedCss: true },
      })
    : null;
  const headerSource = layout?.headerHtml.trim() ?? "";
  const footerSource = layout?.footerHtml.trim() ?? "";
  const sharedCss = layout?.sharedCss.trim() ?? "";

  // The admin preview of a course or programme design has no particular
  // course to show, so it borrows the academy's first public one.
  let course = opts.course ?? null;
  let programme = opts.programme ?? null;
  if (opts.pageId && kind === "COURSE_DETAIL" && !course) {
    const first = (await listPublicCourses(opts.tenantId, ""))[0];
    course = first ? await getPublicCourse(opts.tenantId, first.slug) : null;
  }
  if (opts.pageId && kind === "PROGRAMME_DETAIL" && !programme) {
    const first = (await listPublicProgrammes(opts.tenantId))[0];
    programme = first ? await getPublicProgramme(opts.tenantId, first.slug) : null;
  }

  // One context for the page and its header and footer: a variable is resolved
  // (and its query run) once, however many of the three documents mention it.
  const used = usedVariables(`${source}\n${headerSource}\n${footerSource}`);
  const ctx = await buildVariableContext({
    tenantId: opts.tenantId,
    tenant: tenant as TenantFacts,
    page: { title: page.title, slug: page.slug },
    origin: await currentOrigin(),
    used,
    next: opts.next,
    query: opts.query,
    course,
    programme,
  });

  const main = renderDocument(source, `sp-${page.id}`, kind, ctx);

  // A special page that would not work is never shown in place of the standard
  // screen: a sign-in page whose form was edited away must not be the only way
  // in. (The admin preview, by id, still shows it — that is where it is fixed.)
  if (opts.kind && pageKindProblems(kind, main.doc.html).length > 0) return null;

  // Shared CSS is the academy's own stylesheet for every page; it is scoped to
  // the page's own container like any other author CSS.
  const shared = sharedCss
    ? sanitizeSiteDocument(`<style>${sharedCss}</style>`, `sp-${page.id}`).css
    : "";

  const body = (
    <>
      {shared ? <style dangerouslySetInnerHTML={{ __html: renderCssTemplate(shared, ctx) }} /> : null}
      <Fragmented css={main.css} scope={main.doc.scope} html={main.doc.html} brand={settings.primaryColor} />
      {/* The platform's own code, for the platform's own forms. Rendered only
          when the page declares one, so a brochure page ships no script. */}
      {main.doc.forms.length > 0 ? (
        <SiteRuntime next={opts.next ?? null} referralCode={opts.referralCode ?? null} />
      ) : null}
    </>
  );

  let element: React.ReactElement;
  if (!page.includeShell) {
    element = <main data-site-root>{body}</main>;
  } else {
    // The header and footer may hold a search box, but never a credential form:
    // they are sanitized as an ordinary page.
    const header = headerSource ? renderDocument(headerSource, "sl-header", "PAGE", ctx) : null;
    const footer = footerSource ? renderDocument(footerSource, "sl-footer", "PAGE", ctx) : null;

    const navPages = await prisma.sitePage.findMany({
      where: { tenantId: opts.tenantId, status: "PUBLISHED", showInNav: true, isHome: false, kind: "PAGE" },
      orderBy: { navOrder: "asc" },
      select: { slug: true, title: true },
    });
    // The built-in header greets a signed-in learner with their dashboard
    // rather than asking them to sign in again.
    const viewer = header ? null : await resolveSiteViewer(opts.tenantId);

    element = (
      <TenantLandingShell
        orgName={tenant.name}
        logoUrl={urls.logoUrl}
        navLinks={[
          { href: "/courses", label: "Courses" },
          ...navPages.map((p) => ({ href: `/${p.slug}`, label: p.title })),
        ]}
        signInHref={authHref("login", opts.next)}
        registerHref={authHref("register", opts.next)}
        signedIn={viewer?.isAuthenticated ?? false}
        header={
          header ? (
            <Fragmented as="header" css={header.css} scope={header.doc.scope} html={header.doc.html} brand={settings.primaryColor} />
          ) : undefined
        }
        footer={
          footer ? (
            <Fragmented as="footer" css={footer.css} scope={footer.doc.scope} html={footer.doc.html} brand={settings.primaryColor} />
          ) : undefined
        }
      >
        <main data-site-root>{body}</main>
      </TenantLandingShell>
    );
  }

  return {
    page,
    settings,
    urls,
    headTitle: main.doc.headTitle,
    headDescription: main.doc.headDescription,
    element,
  };
}

/**
 * Request-scoped memoization.
 *
 * The public routes call this twice per request — once in `generateMetadata`
 * for the title and description, once for the page itself. `cache` compares
 * arguments by identity, so callers that want the saving pass the same options
 * object to both; a fresh object simply renders again.
 */
export const renderTenantSitePage = cache(render);

/**
 * The academy's own published design for one of the built-in screens, or null
 * to use the standard one. Never throws: a designed page that cannot be
 * rendered must not take the sign-in screen down with it.
 */
export async function renderDesignedPage(
  opts: Omit<RenderOptions, "slug" | "pageId"> & { kind: Exclude<SitePageKind, "PAGE"> }
): Promise<RenderedSitePage | null> {
  try {
    return await render({ ...opts, slug: null });
  } catch {
    return null;
  }
}
