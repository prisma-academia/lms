import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getCurrencyOptions } from "@/lib/geo/currencies";
import { PageHeader } from "@/components/shell";
import { ProgrammeEditor } from "./programme-editor";

export default async function EditProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_PROGRAMMES_READ.key);
  const { id } = await params;
  const programme = await prisma.programme.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: {
      courses: {
        orderBy: { sortOrder: "asc" },
        include: { course: { select: { id: true, title: true } } },
      },
    },
  });
  if (!programme) notFound();

  const allCourses = await prisma.course.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { id: true, title: true, status: true },
  });

  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_PROGRAMMES_WRITE.key);
  const currencyOptions = getCurrencyOptions();

  return (
    <div>
      <PageHeader title={programme.title} subtitle="Edit programme details and its courses." />
      <ProgrammeEditor
        id={programme.id}
        initial={{
          title: programme.title,
          slug: programme.slug,
          description: programme.description ?? "",
          status: programme.status,
          visibility: programme.visibility,
          priceCents: programme.priceCents,
          currency: programme.currency,
        }}
        selectedCourses={programme.courses.map((pc) => ({
          courseId: pc.courseId,
          title: pc.course.title,
          required: pc.required,
          groupLabel: pc.groupLabel ?? "",
        }))}
        allCourses={allCourses}
        canWrite={canWrite}
        currencyOptions={currencyOptions}
      />
    </div>
  );
}
