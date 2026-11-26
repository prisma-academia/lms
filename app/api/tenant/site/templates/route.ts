import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { templateSummaries } from "@/lib/site/page-templates";
import { htmlSourceSchema } from "@/lib/site/source";
import { SITE_PAGE_KINDS } from "@/lib/site/site-api";
import { SAVED_TEMPLATE_TYPE, toSavedTemplate } from "@/lib/site/saved-templates";

/**
 * The designs a site page can start from: the built-in ones, and the ones this
 * academy has saved from its own pages.
 *
 * Built-in designs are listed without their markup — the gallery has them in
 * its own bundle. Saved designs come with theirs, because this is the only
 * place they live. They are stored raw and go through the sanitizer whenever
 * they are shown or used, like every other site document.
 *
 * Guarded by the SITE permissions, not the general template ones: whoever may
 * edit the site may save and reuse a page design.
 */

const KINDS = SITE_PAGE_KINDS.map((k) => k.kind) as [string, ...string[]];

const SaveBody = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(KINDS).optional(),
  htmlSource: htmlSourceSchema.min(1),
});

/** An academy's own gallery is a convenience, not an archive. */
const MAX_SAVED = 60;

export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_READ.key);
    const rows = await prisma.template.findMany({
      where: { tenantId: actor.tenantId, type: SAVED_TEMPLATE_TYPE },
      orderBy: { createdAt: "desc" },
      take: MAX_SAVED,
    });
    return ok({
      templates: templateSummaries(),
      saved: rows.map(toSavedTemplate).filter((row) => row.htmlSource.trim().length > 0),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_WRITE.key);
    const body = SaveBody.parse(await request.json());

    const row = await prisma.template.create({
      data: {
        tenantId: actor.tenantId,
        type: SAVED_TEMPLATE_TYPE,
        name: body.name,
        contentJson: { htmlSource: body.htmlSource, kind: body.kind ?? "PAGE" },
      },
    });

    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "site_template.create",
      tenantId: actor.tenantId,
      targetType: "Template",
      targetId: row.id,
      after: { name: row.name, kind: body.kind ?? "PAGE" } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok({ template: toSavedTemplate(row) }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
