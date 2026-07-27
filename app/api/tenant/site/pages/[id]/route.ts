import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { siteBlocksSchema } from "@/lib/site/blocks";
import { getPageTemplate } from "@/lib/site/page-templates";
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
  blocks: siteBlocksSchema.optional(),
  applyTemplateId: z.enum(["classic", "minimal", "catalog"]).optional(),
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

    let slug = before.slug;
    if (body.slug !== undefined && !before.isHome) {
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

    let blocksJson: object[] | undefined;
    if (body.applyTemplateId) {
      const template = getPageTemplate(body.applyTemplateId);
      if (!template) throw new DomainError(400, "bad_template", "Unknown template.");
      blocksJson = template.blocks() as object[];
    } else if (body.blocks) {
      blocksJson = body.blocks as object[];
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
        ...(body.slug !== undefined && !before.isHome ? { slug } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.showInNav !== undefined ? { showInNav: body.showInNav } : {}),
        ...(body.navOrder !== undefined ? { navOrder: body.navOrder } : {}),
        ...(body.seoTitle !== undefined ? { seoTitle: body.seoTitle } : {}),
        ...(body.seoDescription !== undefined
          ? { seoDescription: body.seoDescription }
          : {}),
        ...(body.ogImageKey !== undefined ? { ogImageKey: body.ogImageKey } : {}),
        ...(blocksJson !== undefined ? { blocksJson } : {}),
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

    return ok({ page: toRow(page) });
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
