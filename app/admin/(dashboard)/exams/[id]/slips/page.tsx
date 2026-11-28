import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/shell";
import { tenantFormatContext } from "@/lib/tenant/format-context";
import { requestOrigin } from "@/lib/site/metadata";
import { formatZoned } from "@/lib/exams/zoned-time";
import { SlipsSheet, type SlipCandidate } from "./slips-sheet";

export default async function ExamSlipsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ids?: string; sitting?: string }>;
}) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_EXAMS_READ.key);
  const { id } = await params;
  const { ids, sitting } = await searchParams;
  const exam = await prisma.exam.findFirst({
    where: { id, tenantId: actor.tenantId },
    select: { id: true, title: true, code: true, durationMin: true, opensAt: true },
  });
  if (!exam) notFound();

  const idList = ids ? ids.split(",").filter(Boolean).slice(0, 5000) : null;
  const [tenant, sittings, candidates, fmt, origin] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: { name: true } }),
    prisma.examSitting.findMany({ where: { examId: id }, orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } }),
    prisma.examCandidate.findMany({
      where: {
        examId: id,
        ...(idList ? { id: { in: idList } } : {}),
        ...(sitting === "none" ? { sittingId: null } : sitting ? { sittingId: sitting } : {}),
      },
      orderBy: [{ fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        regNumber: true,
        candidateNo: true,
        status: true,
        sitting: { select: { name: true, venue: true, startsAt: true } },
      },
    }),
    tenantFormatContext(actor.tenantId),
    requestOrigin(),
  ]);

  const rows: SlipCandidate[] = candidates.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    regNumber: c.regNumber,
    candidateNo: c.candidateNo,
    active: c.status === "ACTIVE",
    sitting: c.sitting?.name ?? null,
    venue: c.sitting?.venue ?? null,
    when: formatZoned((c.sitting?.startsAt ?? exam.opensAt)?.toISOString(), fmt.timeZone, ""),
  }));

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Candidate slips"
          subtitle={`${exam.title} — each slip carries the candidate's Exam ID and a new PIN.`}
          backHref={`/admin/exams/${id}?tab=candidates`}
          backLabel="Back to the exam"
        />
      </div>
      <SlipsSheet
        examId={id}
        examTitle={exam.title}
        examCode={exam.code}
        durationMin={exam.durationMin}
        academyName={tenant?.name ?? ""}
        loginUrl={`${origin.origin}/exam`}
        candidates={rows}
        sittings={sittings}
        sittingFilter={sitting ?? ""}
        filteredByIds={!!idList}
        canWrite={hasPermission(actor, PERMISSIONS.TENANT_EXAMS_WRITE.key)}
      />
    </div>
  );
}
