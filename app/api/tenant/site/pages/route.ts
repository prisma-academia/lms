import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { getPageTemplate, PAGE_TEMPLATE_IDS } from "@/lib/site/page-templates";
import { analyzeSource, htmlSourceSchema } from "@/lib/site/source";
import {
  ensureHomeSitePage,
  isReservedSlug,
  slugify,
  toRow,
} from "@/lib/site/pages";

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(80).optional(),
  templateId: z.enum(PAGE_TEMPLATE_IDS).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  showInNav: z.boolean().optional(),
  navOrder: z.number().int().min(0).optional(),
  seoTitle: z.string().max(120).nullable().optional(),
  seoDescription: z.string().max(320).nullable().optional(),
  htmlSource: htmlSourceSchema.optional(),
  includeShell: z.boolean().optional(),
});

export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_READ.key);
    await ensureHomeSitePage(actor.tenantId);
    const pages = await prisma.sitePage.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: [{ isHome: "desc" }, { navOrder: "asc" }, { title: "asc" }],
    });
    return ok({ pages: pages.map(toRow) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_WRITE.key);
    const body = CreateBody.parse(await request.json());

    const slug = body.slug != null ? slugify(body.slug) : slugify(body.title);
    if (!slug) throw new DomainError(400, "bad_slug", "Slug is required for non-home pages.");
    if (isReservedSlug(slug)) {
      throw new DomainError(400, "reserved_slug", "That slug is reserved by the app.");
    }

    const existing = await prisma.sitePage.findUnique({
      where: { tenantId_slug: { tenantId: actor.tenantId, slug } },
    });
    if (existing) throw new DomainError(409, "slug_taken", "A page with that slug already exists.");

    const template = body.templateId ? getPageTemplate(body.templateId) : undefined;
    const htmlSource = body.htmlSource ?? template?.html() ?? "";

    const page = await prisma.sitePage.create({
      data: {
        tenantId: actor.tenantId,
        title: body.title,
        slug,
        status: body.status ?? "DRAFT",
        isHome: false,
        showInNav: body.showInNav ?? true,
        navOrder: body.navOrder ?? 0,
        seoTitle: body.seoTitle ?? null,
        seoDescription: body.seoDescription ?? null,
        htmlSource,
        includeShell: body.includeShell ?? true,
      },
    });

    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "site_page.create",
      tenantId: actor.tenantId,
      targetType: "SitePage",
      targetId: page.id,
      after: { title: page.title, slug: page.slug } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok(
      { page: toRow(page), ...analyzeSource(htmlSource, `sp-${page.id}`) },
      undefined,
      201
    );
  } catch (e) {
    return handleError(e);
  }
}
