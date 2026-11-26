import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { analyzeSource } from "@/lib/site/source";
import { defaultFooterHtml, defaultHeaderHtml } from "@/lib/site/kind-starters";

/**
 * The site's header, footer and shared stylesheet.
 *
 * Stored raw and sanitized on every read, exactly like a page (see the note in
 * lib/site/source.ts): an editor that rewrote what the author typed would be
 * worse than one that says what it will ignore. An empty header or footer means
 * "use the built-in one", so clearing a field is how an academy goes back.
 */

/** Smaller than a page: this markup is added to every page of the site. */
const part = z.string().max(60_000);

const Body = z.object({
  headerHtml: part.optional(),
  footerHtml: part.optional(),
  sharedCss: part.optional(),
});

function analysis(layout: { headerHtml: string; footerHtml: string }) {
  return {
    header: analyzeSource(layout.headerHtml, "sl-header"),
    footer: analyzeSource(layout.footerHtml, "sl-footer"),
  };
}

export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_READ.key);
    const layout = await prisma.siteLayout.findUnique({ where: { tenantId: actor.tenantId } });
    const current = {
      headerHtml: layout?.headerHtml ?? "",
      footerHtml: layout?.footerHtml ?? "",
      sharedCss: layout?.sharedCss ?? "",
    };
    return ok({
      layout: current,
      // What the built-in header and footer look like written out, for
      // "start from the standard one".
      defaults: { headerHtml: defaultHeaderHtml(), footerHtml: defaultFooterHtml() },
      ...analysis(current),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_WRITE.key);
    const body = Body.parse(await request.json());

    const data = {
      ...(body.headerHtml !== undefined ? { headerHtml: body.headerHtml } : {}),
      ...(body.footerHtml !== undefined ? { footerHtml: body.footerHtml } : {}),
      ...(body.sharedCss !== undefined ? { sharedCss: body.sharedCss } : {}),
      updatedById: actor.userId,
    };
    const layout = await prisma.siteLayout.upsert({
      where: { tenantId: actor.tenantId },
      create: { tenantId: actor.tenantId, ...data },
      update: data,
    });

    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "site_layout.update",
      tenantId: actor.tenantId,
      targetType: "SiteLayout",
      targetId: actor.tenantId,
      after: {
        header: layout.headerHtml.length > 0,
        footer: layout.footerHtml.length > 0,
        sharedCss: layout.sharedCss.length > 0,
      } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const current = {
      headerHtml: layout.headerHtml,
      footerHtml: layout.footerHtml,
      sharedCss: layout.sharedCss,
    };
    return ok({ layout: current, ...analysis(current) });
  } catch (e) {
    return handleError(e);
  }
}
