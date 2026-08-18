import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { buildVariableContext } from "@/lib/site/variable-context";
import { SITE_VARIABLES, sampleContext } from "@/lib/site/variables";

/**
 * The variable values the editor's live preview substitutes while you type.
 *
 * Fetched once when the editor mounts, then reused for every keystroke — the
 * preview has to feel instant, and re-resolving the catalog on each debounce
 * would put a database round-trip in the typing loop.
 *
 * Real tenant, course and programme data is returned so the preview matches the
 * published page. `user.*` and `progress.*` cannot be: the person editing is a
 * tenant admin, not one of their learners, and pulling some learner's actual
 * progress into an admin screen to make a preview look convincing would be a
 * privacy leak, not a feature. Those come back as clearly-marked sample values
 * so `{{#if user.isAuthenticated}}` branches are still previewable.
 */
export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_READ.key);

    const tenant = await prisma.tenant.findUnique({
      where: { id: actor.tenantId },
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
    if (!tenant) return ok({ context: sampleContext(), sampled: ["user", "progress"] });

    // Ask for every non-auth path so the preview has the full catalog to hand.
    const used = SITE_VARIABLES.filter((v) => !v.authOnly).map((v) => v.path);

    const context = await buildVariableContext({
      tenantId: actor.tenantId,
      tenant,
      page: { title: "Preview", slug: "" },
      origin: "",
      used,
    });

    const samples = sampleContext();
    context.user = samples.user as never;
    context.progress = samples.progress as never;

    return ok({ context, sampled: ["user", "progress"] });
  } catch (e) {
    return handleError(e);
  }
}
