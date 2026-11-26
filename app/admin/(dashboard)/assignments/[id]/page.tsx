import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { PageHeader, Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { GradeForm } from "./grade-form";
import { tenantFormatContext } from "@/lib/tenant/format-context";

function clientName(c: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const n = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
  return n || c.email;
}

export default async function AdminAssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_ASSIGNMENTS_READ.key);
  const { id } = await params;

  const [assignment, when] = await Promise.all([
    prisma.assignment.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        course: { select: { title: true } },
        submissions: {
          orderBy: { submittedAt: "desc" },
          include: {
            client: {
              select: { firstName: true, lastName: true, email: true },
            },
            grade: true,
          },
        },
      },
    }),
    tenantFormatContext(actor.tenantId),
  ]);
  if (!assignment) notFound();

  const canGrade = hasPermission(actor, PERMISSIONS.TENANT_GRADES_WRITE.key);
  const ungraded = assignment.submissions.filter((s) => !s.grade).length;

  return (
    <div className="max-w-3xl">
      <PageHeader title={assignment.title} backHref="/admin/assignments" backLabel="Assignments" />

      <Card>
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold text-muted-foreground">
          <Badge color="var(--chart-1)" className="max-w-full">
            <span className="min-w-0 truncate">{assignment.course.title}</span>
          </Badge>
          {assignment.publishedAt ? (
            <Badge color="var(--success)">Published</Badge>
          ) : (
            <Badge>Draft</Badge>
          )}
          <span className="num">Marked out of {assignment.maxPoints}</span>
          {assignment.dueAt ? (
            <span className="num">· due {formatDate(assignment.dueAt, when)}</span>
          ) : null}
        </div>
        {assignment.description ? (
          <p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-relaxed text-foreground">
            {assignment.description}
          </p>
        ) : (
          <p className="mt-3 text-sm font-medium text-muted-foreground">No instructions were given.</p>
        )}
      </Card>

      <div className="mb-3 mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg leading-tight">Submissions</h2>
        <p className="num text-[13px] font-medium text-muted-foreground">
          {assignment.submissions.length} handed in
          {assignment.submissions.length > 0 ? ` · ${ungraded} still to mark` : ""}
        </p>
      </div>

      {assignment.submissions.length === 0 ? (
        <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
          <EmptyState icon="clipboard" title="Nothing handed in yet">
            {assignment.publishedAt
              ? "Work appears here as learners submit it."
              : "This assignment is still a draft, so learners cannot see it or hand anything in."}
          </EmptyState>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {assignment.submissions.map((s) => (
            <li
              key={s.id}
              className="rounded-[14px] border-2 border-border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 break-words font-bold text-foreground">{clientName(s.client)}</h3>
                {s.grade ? (
                  <Badge color="var(--success)" rotate>
                    {s.grade.points}/{s.grade.maxPoints}
                  </Badge>
                ) : (
                  <Badge color="var(--warning)">Not marked</Badge>
                )}
                <time
                  dateTime={s.submittedAt.toISOString()}
                  className="num ml-auto text-[12px] font-bold text-muted-foreground"
                >
                  Handed in {formatDateTime(s.submittedAt, when)}
                </time>
              </div>

              {s.textBody ? (
                <p className="mt-3 whitespace-pre-wrap break-words rounded-[10px] border-2 border-dashed border-border bg-muted p-3 text-sm font-medium text-foreground">
                  {s.textBody}
                </p>
              ) : null}
              {s.linkUrl ? (
                <a
                  href={s.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-[8px] text-sm font-bold underline decoration-2 underline-offset-2 outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Icon name="external-link" aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">Open what they handed in</span>
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : null}

              {canGrade ? (
                <GradeForm
                  submissionId={s.id}
                  learnerName={clientName(s.client)}
                  maxPoints={s.grade?.maxPoints ?? assignment.maxPoints}
                  initialPoints={s.grade?.points ?? null}
                  initialFeedback={s.grade?.feedback ?? null}
                />
              ) : s.grade?.feedback ? (
                <p className="mt-3 text-sm font-medium text-foreground">
                  <span className="font-bold">Feedback: </span>
                  {s.grade.feedback}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
