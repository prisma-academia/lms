import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { accessibleBankWhere } from "@/lib/assessments/bank-access";
import { PageHeader } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { candidateRows, examDetail } from "@/lib/exams/admin";
import { EXAM_STATUS_COLOR, EXAM_STATUS_LABEL } from "@/lib/exams/admin-dto";
import { tenantFormatContext } from "@/lib/tenant/format-context";
import { requestOrigin } from "@/lib/site/metadata";
import { ExamBuilder } from "./exam-builder";

export default async function ExamBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_EXAMS_READ.key);
  const { id } = await params;
  const { tab } = await searchParams;
  const exam = await examDetail(actor.tenantId, id);
  if (!exam) notFound();

  const access = await accessibleBankWhere(actor);
  const [candidates, banks, tags, courses, certificates, groups, fmt, origin] = await Promise.all([
    candidateRows(id),
    prisma.questionBank.findMany({
      where: { AND: [{ tenantId: actor.tenantId }, access] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { questions: true } } },
    }),
    prisma.questionTag.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.course.findMany({ where: { tenantId: actor.tenantId }, orderBy: { title: "asc" }, select: { id: true, title: true }, take: 500 }),
    prisma.certificate.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.clientGroup.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { memberships: true } } },
    }),
    tenantFormatContext(actor.tenantId),
    requestOrigin(),
  ]);

  return (
    <div data-wide-page>
      <PageHeader
        title={exam.title}
        subtitle={exam.code ? `Exam code ${exam.code}` : "Build the paper, choose who sits it and how it is protected."}
        backHref="/admin/exams"
        backLabel="Exams"
        action={<Badge color={EXAM_STATUS_COLOR[exam.status]}>{EXAM_STATUS_LABEL[exam.status]}</Badge>}
      />
      <ExamBuilder
        initial={exam}
        initialCandidates={candidates}
        lookups={{
          banks: banks.map((b) => ({ id: b.id, name: b.name, questionCount: b._count.questions })),
          tags,
          courses: courses.map((c) => ({ id: c.id, name: c.title })),
          certificates,
          groups: groups.map((g) => ({ id: g.id, name: g.name, members: g._count.memberships })),
        }}
        timeZone={fmt.timeZone}
        origin={origin.origin}
        canWrite={hasPermission(actor, PERMISSIONS.TENANT_EXAMS_WRITE.key)}
        canProctor={hasPermission(actor, PERMISSIONS.TENANT_EXAMS_PROCTOR.key)}
        canGrade={hasPermission(actor, PERMISSIONS.TENANT_EXAMS_GRADE.key)}
        initialTab={tab}
      />
    </div>
  );
}
