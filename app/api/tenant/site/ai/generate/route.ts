import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { enforceRateLimit, type RateLimitPreset } from "@/lib/auth/rate-limit";
import { aiDomainError, requireAiConfigured } from "@/lib/ai/http";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { brandingAssetUrls } from "@/lib/tenant/branding-assets";
import { buildVariableContext, type SiteViewer, type TenantFacts } from "@/lib/site/variable-context";
import {
  getPublicCourse,
  getPublicProgramme,
  listPublicCourses,
  listPublicProgrammes,
} from "@/lib/site/public-catalog";
import { usedVariables, type VariableContext } from "@/lib/site/template";
import { sampleContext } from "@/lib/site/variables";
import { findPageKind, type SitePageKind } from "@/lib/site/site-api";
import { effectiveKind } from "@/lib/site/ai-guide";
import { designSite, renderSitePreview, siteAiBudgetVerdict, siteDesignRequestSchema } from "@/lib/site/ai";

/**
 * Design a site page, header or footer with AI, or change the one in the editor.
 *
 * Returns a document; it never saves one. What comes back has been cleaned and
 * checked for the kind of page it is, and is rendered for preview through the
 * same two steps the public site uses (variables, then the sanitizer) — but it
 * only becomes the page when a person presses Apply in the editor and then
 * Save.
 */

// Up to two model calls (the design, then one correction if it needs it), and a
// page is a long reply.
export const maxDuration = 300;

/** The action each request is recorded under. Also what the spend cap counts. */
const AUDIT_ACTION = "site.ai_design";

/** A second, tighter brake per person, where a rate limiter is configured. */
const PER_USER: RateLimitPreset = { name: "site-design", limit: 12, windowSeconds: 10 * 60 };

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

/** The preview is what a visitor gets, and a visitor is signed out. */
const VISITOR: SiteViewer = { isAuthenticated: false, clientId: null, name: "", email: "" };

/**
 * How many designs one academy may ask for.
 *
 * Counted from the audit log rather than a rate limiter, for the same reason
 * the essay grader's cap is: the limiter fails open when it is not configured,
 * which is right for sign-in and wrong for anything that costs money per call.
 */
async function enforceBudget(tenantId: string): Promise<void> {
  const now = Date.now();
  const [lastHour, lastDay] = await Promise.all([
    prisma.activityLog.count({
      where: { tenantId, action: AUDIT_ACTION, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
    }),
    prisma.activityLog.count({
      where: { tenantId, action: AUDIT_ACTION, createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } },
    }),
  ]);
  const refusal = siteAiBudgetVerdict({ lastHour, lastDay });
  if (refusal) throw new DomainError(429, "ai_budget", refusal);
}

function isEmptyList(value: unknown): boolean {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * The data a preview is rendered with: the academy's own, as a signed-out
 * visitor would get it, with sample rows standing in where the academy has
 * nothing yet — an empty catalogue would show the design's empty state and
 * hide the part being designed.
 */
async function previewContext(input: {
  tenantId: string;
  tenant: TenantFacts;
  kind: SitePageKind;
  html: string;
  page: { title: string; slug: string };
  origin: string;
}): Promise<VariableContext> {
  const { tenantId, kind } = input;
  const sample = sampleContext() as VariableContext;

  // A course or programme design has no particular one to show: borrow the first public one.
  let course = null;
  let programme = null;
  if (kind === "COURSE_DETAIL") {
    const first = (await listPublicCourses(tenantId, ""))[0];
    course = first ? await getPublicCourse(tenantId, first.slug) : null;
  }
  if (kind === "PROGRAMME_DETAIL") {
    const first = (await listPublicProgrammes(tenantId))[0];
    programme = first ? await getPublicProgramme(tenantId, first.slug) : null;
  }

  const real = await buildVariableContext({
    tenantId,
    tenant: input.tenant,
    page: input.page,
    origin: input.origin,
    used: usedVariables(input.html),
    viewer: VISITOR,
    course,
    programme,
  });

  const context: VariableContext = { ...sample, ...real };
  for (const list of ["courses", "programmes", "nav"] as const) {
    if (isEmptyList(real[list])) context[list] = sample[list];
  }
  if (Array.isArray(context.courses)) {
    context.catalog = { ...(real.catalog as Record<string, string | number>), count: context.courses.length };
  }
  return context;
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_WRITE.key);
    const body = siteDesignRequestSchema.parse(await request.json());

    // The page, when there is one. Its stored kind wins over what the editor
    // sent: which forms a page may contain is not the browser's to say.
    const page =
      body.target === "page" && body.pageId
        ? await prisma.sitePage.findFirst({
            where: { id: body.pageId, tenantId: actor.tenantId },
            select: { id: true, title: true, slug: true, kind: true },
          })
        : null;
    if (body.target === "page" && body.pageId && !page) {
      throw new DomainError(404, "not_found", "Page not found.");
    }
    const kind = effectiveKind(body.target, page ? page.kind : body.kind);
    const designRequest = { ...body, kind };

    requireAiConfigured();
    await enforceRateLimit(PER_USER, [actor.userId]);
    await enforceBudget(actor.tenantId);

    // Recorded BEFORE the call: a request that fails halfway has still been
    // paid for, and the cap above has to see requests that are in flight.
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: AUDIT_ACTION,
      tenantId: actor.tenantId,
      targetType: body.target === "page" ? "SitePage" : "SiteLayout",
      targetId: page?.id ?? actor.tenantId,
      after: { target: body.target, kind, mode: body.mode },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: TENANT_FIELDS });
    if (!tenant) throw new DomainError(404, "not_found", "Academy not found.");
    const settings = parseTenantSettings(tenant.settingsJson);

    // Facts for the copy: what this academy is, in a few lines. Titles only.
    const [courses, programmes, navPages] = await Promise.all([
      listPublicCourses(actor.tenantId, ""),
      listPublicProgrammes(actor.tenantId),
      prisma.sitePage.findMany({
        where: { tenantId: actor.tenantId, status: "PUBLISHED", showInNav: true, isHome: false, kind: "PAGE" },
        orderBy: { navOrder: "asc" },
        select: { title: true },
        take: 12,
      }),
    ]);

    // Lazy import keeps the Mastra instance (native storage deps) out of the
    // module graph until AI is actually used.
    const { getMastra } = await import("@/src/mastra");

    let result;
    try {
      const mastra = await getMastra();
      result = await designSite(mastra.getAgent("siteBuilderAgent"), designRequest, {
        tenantName: tenant.name,
        hasLogo: Boolean(brandingAssetUrls(settings).logoUrl),
        hasHeroImage: Boolean(settings.heroImageKey),
        hasEmail: Boolean(tenant.companyEmail),
        hasPhone: Boolean(tenant.companyPhone),
        hasAddress: Boolean(tenant.addressLine1 || tenant.city),
        courseTitles: courses.slice(0, 6).map((c) => c.title),
        courseCount: courses.length,
        programmeCount: programmes.length,
        navTitles: navPages.map((p) => p.title),
        pageTitle: page?.title ?? body.pageTitle ?? null,
      });
    } catch (e) {
      throw aiDomainError(e, "site_design");
    }

    // The academy's own data, as a signed-out visitor would see the page.
    const context = await previewContext({
      tenantId: actor.tenantId,
      tenant,
      kind: result.kind,
      html: result.html,
      page: { title: page?.title ?? body.pageTitle ?? findPageKind(result.kind).label, slug: page?.slug ?? "" },
      origin: new URL(request.url).origin,
    });
    const preview = renderSitePreview(
      result.html,
      result.kind,
      context,
      `site-ai-${page?.id ?? body.target}`,
      body.target
    );

    return ok({
      html: result.html,
      kind: result.kind,
      preview: { ...preview, brand: settings.primaryColor },
      report: result.report,
      attempts: result.attempts,
    });
  } catch (e) {
    return handleError(e);
  }
}
