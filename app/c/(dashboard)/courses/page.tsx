import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";
import { PageHeader } from "@/components/shell";
import { formatPrice } from "@/lib/site/public-format";
import { tenantFormatContext } from "../_lib/format-context";
import { CourseCatalog, type CatalogCourse } from "./catalog";

export default async function CourseCatalogPage() {
  const actor = await requireClientPage();

  const enrollments = await prisma.enrollment.findMany({
    where: { clientId: actor.clientId },
    select: { courseId: true, progressPercent: true, completedAt: true },
  });
  const enrolledMap = new Map(enrollments.map((e) => [e.courseId, e]));

  // Only public published courses are browsable; keep any already-enrolled
  // (e.g. privately onboarded) courses visible too.
  const courses = await prisma.course.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { visibility: "PUBLIC" },
        ...(enrolledMap.size > 0 ? [{ id: { in: [...enrolledMap.keys()] } }] : []),
      ],
    },
    orderBy: { publishedAt: "desc" },
    include: { _count: { select: { lessons: true } } },
  });

  // Prices are formatted here, in the academy's locale. The catalogue is a
  // Client Component: formatting there would run once on the server and again
  // in the browser, each in its own locale, and the two would not match.
  const { locale } = await tenantFormatContext(actor.tenantId);

  const rows: CatalogCourse[] = courses.map((c) => {
    const e = enrolledMap.get(c.id);
    return {
      id: c.id,
      title: c.title,
      slug: c.slug,
      description: c.description,
      priceCents: c.priceCents,
      currency: c.currency,
      priceLabel: formatPrice(c.priceCents, c.currency, locale),
      thumbnailUrl:
        c.thumbnailKey && s3Configured() ? publicUrlForKey(c.thumbnailKey) : null,
      lessonCount: c._count.lessons,
      enrollment: e
        ? {
            progressPercent: e.progressPercent,
            completedAt: e.completedAt ? e.completedAt.toISOString() : null,
          }
        : null,
    };
  });

  return (
    <div>
      <PageHeader
        title="Catalog"
        subtitle={`${rows.length} course${rows.length === 1 ? "" : "s"} available`}
      />
      <CourseCatalog courses={rows} />
    </div>
  );
}
