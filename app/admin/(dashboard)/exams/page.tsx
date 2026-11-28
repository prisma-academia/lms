import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { LIVE_ATTEMPT_STATUSES } from "@/lib/exams/admin";
import { EXAM_STATUS_COLOR, EXAM_STATUS_LABEL } from "@/lib/exams/admin-dto";
import { formatZoned } from "@/lib/exams/zoned-time";
import { tenantFormatContext } from "@/lib/tenant/format-context";

const quickLink =
  "inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border-2 border-border bg-card px-2.5 text-[12.5px] font-bold text-card-foreground shadow-sm outline-none transition-transform hover:-translate-x-px hover:-translate-y-px hover:shadow-md focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

export default async function ExamsPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_EXAMS_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_EXAMS_WRITE.key);
  const canProctor = hasPermission(actor, PERMISSIONS.TENANT_EXAMS_PROCTOR.key);
  const canGrade = hasPermission(actor, PERMISSIONS.TENANT_EXAMS_GRADE.key);
  const { timeZone } = await tenantFormatContext(actor.tenantId);

  const exams = await prisma.exam.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      course: { select: { title: true } },
      _count: { select: { candidates: true, attempts: true } },
    },
  });
  const live = exams.length
    ? await prisma.examAttempt.groupBy({
        by: ["examId"],
        where: { tenantId: actor.tenantId, examId: { in: exams.map((e) => e.id) }, status: { in: [...LIVE_ATTEMPT_STATUSES] } },
        _count: { _all: true },
      })
    : [];
  const liveBy = new Map(live.map((l) => [l.examId, l._count._all]));

  return (
    <div>
      <PageHeader
        title="Exams"
        subtitle="Timed, invigilated computer-based tests: build the paper, add candidates, then run it live."
        action={
          canWrite ? (
            <Button asChild>
              <Link href="/admin/exams/new">
                <Icon name="plus" aria-hidden />
                New exam
              </Link>
            </Button>
          ) : undefined
        }
      />

      {exams.length === 0 ? (
        <Card>
          <EmptyState
            icon="monitor"
            title="No exams yet"
            action={
              canWrite ? (
                <Button asChild>
                  <Link href="/admin/exams/new">Create your first exam</Link>
                </Button>
              ) : undefined
            }
          >
            An exam draws its questions from your question banks, runs in a locked full-screen window and can be
            sat with an Exam ID and PIN — no learner account needed.
          </EmptyState>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {exams.map((e) => {
            const liveCount = liveBy.get(e.id) ?? 0;
            const window =
              e.opensAt || e.closesAt
                ? `${formatZoned(e.opensAt?.toISOString(), timeZone, "Any time")} → ${formatZoned(e.closesAt?.toISOString(), timeZone, "no close")}`
                : "No window set";
            return (
              <li key={e.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 basis-72">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/exams/${e.id}`}
                          className="rounded-[6px] font-heading text-lg leading-tight underline-offset-4 outline-none hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {e.title}
                        </Link>
                        <Badge color={EXAM_STATUS_COLOR[e.status]}>{EXAM_STATUS_LABEL[e.status]}</Badge>
                        {e.code ? <Badge className="font-mono">{e.code}</Badge> : null}
                        {liveCount > 0 ? (
                          <Badge color="var(--destructive)">
                            <span aria-hidden className="size-1.5 rounded-full bg-current" />
                            {liveCount} live now
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">
                        {e.kind === "COURSE" ? `Course exam${e.course ? ` · ${e.course.title}` : ""}` : "Standalone"} ·{" "}
                        {e.durationMin} min · {window}
                      </p>
                      <p className="num mt-1 text-[13px] font-bold text-foreground">
                        {e._count.candidates} {e._count.candidates === 1 ? "candidate" : "candidates"} · {e._count.attempts}{" "}
                        {e._count.attempts === 1 ? "attempt" : "attempts"}
                      </p>
                    </div>
                    <nav aria-label={`${e.title} shortcuts`} className="flex flex-wrap gap-2">
                      <Link href={`/admin/exams/${e.id}`} className={quickLink}>
                        <Icon name="layers" className="size-4" aria-hidden />
                        Build
                      </Link>
                      {canProctor ? (
                        <Link href={`/admin/exams/${e.id}/live`} className={quickLink}>
                          <Icon name="activity" className="size-4" aria-hidden />
                          Live
                        </Link>
                      ) : null}
                      {canGrade ? (
                        <Link href={`/admin/exams/${e.id}/marking`} className={quickLink}>
                          <Icon name="check-circle" className="size-4" aria-hidden />
                          Marking
                        </Link>
                      ) : null}
                      <Link href={`/admin/exams/${e.id}/results`} className={quickLink}>
                        <Icon name="chart" className="size-4" aria-hidden />
                        Results
                      </Link>
                    </nav>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
