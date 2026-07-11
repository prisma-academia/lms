import { DAY, type SeedContext } from "../index";
import { NG_LOCALE } from "../components/locale/ng";
import { PROGRAMME_CATALOG } from "../components/catalogs/programmes";

export async function seedProgrammes(ctx: SeedContext): Promise<void> {
  for (const p of PROGRAMME_CATALOG) {
    const programme = await ctx.prisma.programme.create({
      data: {
        tenantId: ctx.tenantId,
        title: p.title,
        slug: p.slug,
        description: p.description,
        status: "PUBLISHED",
        visibility: "PUBLIC",
        priceCents: 0,
        currency: NG_LOCALE.currency,
        publishedAt: new Date(ctx.now - 25 * DAY),
      },
    });
    ctx.ids.programmeBySlug[p.slug] = programme.id;

    for (const pc of p.courses) {
      const course = ctx.ids.courseBySlug[pc.courseSlug];
      if (!course) continue;
      await ctx.prisma.programmeCourse.create({
        data: {
          tenantId: ctx.tenantId,
          programmeId: programme.id,
          courseId: course.courseId,
          required: pc.required,
          sortOrder: pc.sortOrder,
          groupLabel: pc.groupLabel ?? null,
        },
      });
    }
  }
}
