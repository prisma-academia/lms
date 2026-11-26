import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { getPageTemplate, PAGE_TEMPLATE_IDS } from "@/lib/site/page-templates";
import { analyzeSource, htmlSourceSchema, publishProblems } from "@/lib/site/source";
import { findPageKind } from "@/lib/site/site-api";
import { isReservedSlug, slugify, toRow } from "@/lib/site/pages";

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().max(80).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  showInNav: z.boolean().optional(),
  navOrder: z.number().int().min(0).optional(),
  seoTitle: z.string().max(120).nullable().optional(),
  seoDescription: z.string().max(320).nullable().optional(),
  ogImageKey: z.string().max(300).nullable().optional(),
  htmlSource: htmlSourceSchema.optional(),
  includeShell: z.boolean().optional(),
  applyTemplateId: z.enum(PAGE_TEMPLATE_IDS).optional(),
  setHome: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_READ.key);
    const { id } = await ctx.params;
    const page = await prisma.sitePage.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!page) throw new DomainError(404, "not_found", "Page not found.");
    return ok({ page: toRow(page) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());

    const before = await prisma.sitePage.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!before) throw new DomainError(404, "not_found", "Page not found.");

    const kind = findPageKind(before.kind);
    const special = kind.kind !== "PAGE";
    if (special && body.setHome) {
      throw new DomainError(400, "not_a_page", `A ${kind.label.toLowerCase()} cannot be the home page.`);
    }

    let slug = before.slug;
    // A special page's slug is fixed: it is how the page is found for its kind.
    if (body.slug !== undefined && !before.isHome && !special) {
      slug = slugify(body.slug);
      if (!slug) throw new DomainError(400, "bad_slug", "Slug cannot be empty.");
      if (isReservedSlug(slug)) {
        throw new DomainError(400, "reserved_slug", "That slug is reserved by the app.");
      }
      if (slug !== before.slug) {
        const clash = await prisma.sitePage.findUnique({
          where: { tenantId_slug: { tenantId: actor.tenantId, slug } },
        });
        if (clash) throw new DomainError(409, "slug_taken", "A page with that slug already exists.");
      }
    }

    let htmlSource: string | undefined;
    if (body.applyTemplateId) {
      const template = getPageTemplate(body.applyTemplateId);
      if (!template) throw new DomainError(400, "bad_template", "Unknown template.");
      htmlSource = template.html();
    } else if (body.htmlSource !== undefined) {
      htmlSource = body.htmlSource;
    }

    // Going live — or staying live with new content — must leave a special
    // page that works. Checked against the source as it WILL be.
    const willBePublished = (body.status ?? before.status) === "PUBLISHED";
    if (special && willBePublished) {
      const problems = publishProblems(htmlSource ?? before.htmlSource, kind.kind);
      if (problems.length > 0) {
        throw new DomainError(
          400,
          "page_not_ready",
          `${problems.join(" ")} Until that is fixed, visitors keep seeing the standard screen — save it as a draft to keep working on it.`
        );
      }
    }

    if (body.setHome) {
      await prisma.sitePage.updateMany({
        where: { tenantId: actor.tenantId, isHome: true },
        data: { isHome: false },
      });
    }

    const page = await prisma.sitePage.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.slug !== undefined && !before.isHome && !special ? { slug } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.showInNav !== undefined && !special ? { showInNav: body.showInNav } : {}),
        ...(body.navOrder !== undefined ? { navOrder: body.navOrder } : {}),
        ...(body.seoTitle !== undefined ? { seoTitle: body.seoTitle } : {}),
        ...(body.seoDescription !== undefined
          ? { seoDescription: body.seoDescription }
          : {}),
        ...(body.ogImageKey !== undefined ? { ogImageKey: body.ogImageKey } : {}),
        ...(htmlSource !== undefined ? { htmlSource } : {}),
        ...(body.includeShell !== undefined ? { includeShell: body.includeShell } : {}),
        ...(body.setHome
          ? { isHome: true, slug: "", status: "PUBLISHED" as const }
          : {}),
      },
    });

    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "site_page.update",
      tenantId: actor.tenantId,
      targetType: "SitePage",
      targetId: page.id,
      before: { title: before.title, slug: before.slug, status: before.status } as object,
      after: { title: page.title, slug: page.slug, status: page.status } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok({
      page: toRow(page),
      ...analyzeSource(page.htmlSource, `sp-${page.id}`, kind.kind),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_WRITE.key);
    const { id } = await ctx.params;
    const page = await prisma.sitePage.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!page) throw new DomainError(404, "not_found", "Page not found.");
    if (page.isHome) {
      throw new DomainError(400, "cannot_delete_home", "Cannot delete the home page.");
    }
    await prisma.sitePage.delete({ where: { id } });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "site_page.delete",
      tenantId: actor.tenantId,
      targetType: "SitePage",
      targetId: id,
      before: { title: page.title, slug: page.slug } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
