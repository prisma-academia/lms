import { prisma } from "@/lib/db/client";
import { PageHeader, Card } from "@/components/shell";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CreateExamForm } from "./create-exam-form";

export default async function NewExamPage({ searchParams }: { searchParams: Promise<{ courseId?: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_EXAMS_WRITE.key);
  const { courseId } = await searchParams;
  const courses = await prisma.course.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
    take: 500,
  });
  const preset = courses.some((c) => c.id === courseId) ? courseId! : "";
  return (
    <div>
      <PageHeader
        title="New exam"
        subtitle="Start with the basics. The paper, candidates and security are set up next."
        backHref="/admin/exams"
        backLabel="Exams"
      />
      <Card>
        <CreateExamForm courses={courses.map((c) => ({ value: c.id, label: c.title }))} presetCourseId={preset} />
      </Card>
    </div>
  );
}
