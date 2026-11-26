import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { formatPrice } from "@/lib/site/public-format";
import { tenantFormatContext } from "../_lib/format-context";
import { ProgrammesCatalog, type CatalogProgramme } from "./programmes-catalog";

export default async function ClientProgrammesPage() {
  const actor = await requireClientPage();

  const enrollments = await prisma.enrollment.findMany({
    where: { clientId: actor.clientId },
    select: { courseId: true },
  });
  const enrolledSet = new Set(enrollments.map((e) => e.courseId));

  const programmes = await prisma.programme.findMany({
    where: { status: "PUBLISHED", visibility: "PUBLIC" },
    orderBy: { publishedAt: "desc" },
    include: { courses: { select: { courseId: true, course: { select: { status: true } } } } },
  });

  // Formatted on the server, in the academy's locale — see the note in
  // ../courses/page.tsx.
  const { locale } = await tenantFormatContext(actor.tenantId);

  const rows: CatalogProgramme[] = programmes.map((p) => {
    const publishedCourseIds = p.courses
      .filter((pc) => pc.course.status === "PUBLISHED")
      .map((pc) => pc.courseId);
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      description: p.description,
      priceCents: p.priceCents,
      currency: p.currency,
      priceLabel: formatPrice(p.priceCents, p.currency, locale),
      totalCourses: publishedCourseIds.length,
      enrolledCourses: publishedCourseIds.filter((id) => enrolledSet.has(id)).length,
    };
  });

  return (
    <div>
      <PageHeader
        title="Programmes"
        subtitle={`${rows.length} programme${rows.length === 1 ? "" : "s"} available`}
      />
      <ProgrammesCatalog programmes={rows} />
    </div>
  );
}
