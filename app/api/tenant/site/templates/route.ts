import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { PAGE_TEMPLATES } from "@/lib/site/page-templates";

export async function GET() {
  try {
    await requireTenantActor(PERMISSIONS.TENANT_SITE_READ.key);
    return ok({
      templates: PAGE_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
