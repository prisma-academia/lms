import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { buildVariableContext } from "@/lib/site/variable-context";
import { SITE_VARIABLES, sampleContext } from "@/lib/site/variables";
import { findPageKind } from "@/lib/site/site-api";
import {
  getPublicCourse,
  getPublicProgramme,
  listPublicCourses,
  listPublicProgrammes,
} from "@/lib/site/public-catalog";

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
 *
 * `?kind=COURSE_DETAIL` (or `PROGRAMME_DETAIL`) additionally fills `course.*`
 * (or `programme.*`) from the academy's first public course or programme — the
 * same stand-in the saved preview uses — and falls back to sample values when
 * there is none yet. `sampled` names every part that is not the academy's own
 * data, so the editor can say so.
 */
export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SITE_READ.key);
    const kind = findPageKind(new URL(request.url).searchParams.get("kind")).kind;
    const samples = sampleContext();

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
    if (!tenant) {
      return ok({ context: samples, sampled: ["user", "progress", "course", "programme"] });
    }

    // The detail pages show ONE course or programme. Borrow the first public one.
    let course = null;
    let programme = null;
    if (kind === "COURSE_DETAIL") {
      const first = (await listPublicCourses(actor.tenantId, ""))[0];
      course = first ? await getPublicCourse(actor.tenantId, first.slug) : null;
    }
    if (kind === "PROGRAMME_DETAIL") {
      const first = (await listPublicProgrammes(actor.tenantId))[0];
      programme = first ? await getPublicProgramme(actor.tenantId, first.slug) : null;
    }

    // Ask for every non-auth path so the preview has the full catalog to hand.
    const used = SITE_VARIABLES.filter((v) => !v.authOnly).map((v) => v.path);

    const context = await buildVariableContext({
      tenantId: actor.tenantId,
      tenant,
      page: { title: "Preview", slug: "" },
      origin: "",
      used,
      course,
      programme,
    });

    const sampled = ["user", "progress"];
    context.user = samples.user as never;
    context.progress = samples.progress as never;
    // Always present, so a `{{ course.title }}` typed on any page previews as
    // something — but only real on the page kind it belongs to.
    if (!course) {
      context.course = samples.course as never;
      sampled.push("course");
    }
    if (!programme) {
      context.programme = samples.programme as never;
      sampled.push("programme");
    }

    return ok({ context, sampled });
  } catch (e) {
    return handleError(e);
  }
}
