import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { GradeForm } from "./grade-form";

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

  const assignment = await prisma.assignment.findFirst({
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
  });
  if (!assignment) notFound();

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/assignments"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-ink/60 hover:text-ink"
      >
        <Icon name="arrow-left" className="size-4" /> Assignments
      </Link>

      <div className="rounded-[14px] border-2 border-ink bg-card p-5 shadow-brutal">
        <h1 className="font-heading text-2xl leading-tight">{assignment.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] font-bold text-ink/60">
          <Badge color="var(--blue)">{assignment.course.title}</Badge>
          {assignment.publishedAt ? (
            <Badge color="var(--green)">Published</Badge>
          ) : (
            <Badge>Draft</Badge>
          )}
          <span className="num">{assignment.maxPoints} pts</span>
          {assignment.dueAt ? (
            <span className="num">· due {assignment.dueAt.toLocaleDateString()}</span>
          ) : null}
        </div>
        {assignment.description ? (
          <p className="mt-3 text-sm font-medium leading-relaxed text-ink/80">
            {assignment.description}
          </p>
        ) : null}
      </div>

      <h2 className="mb-3 mt-6 text-[12px] font-bold uppercase tracking-[0.1em] text-ink/60">
        Submissions ({assignment.submissions.length})
      </h2>

      {assignment.submissions.length === 0 ? (
        <div className="rounded-[14px] border-2 border-ink bg-card p-4 shadow-brutal">
          <EmptyState icon="clipboard">No submissions yet.</EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {assignment.submissions.map((s) => (
            <div
              key={s.id}
              className="rounded-[14px] border-2 border-ink bg-card p-4 shadow-brutal-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-ink">{clientName(s.client)}</span>
                {s.grade ? (
                  <Badge color="var(--green)" rotate>
                    {s.grade.points}/{s.grade.maxPoints}
                  </Badge>
                ) : (
                  <Badge color="var(--orange)">Ungraded</Badge>
                )}
                <span className="num ml-auto text-[12px] font-bold text-ink/50">
                  {s.submittedAt.toLocaleDateString()}
                </span>
              </div>

              {s.textBody ? (
                <p className="mt-3 whitespace-pre-wrap rounded-[10px] border-2 border-dashed border-ink/20 bg-paper/50 p-3 text-sm font-medium text-ink/90">
                  {s.textBody}
                </p>
              ) : null}
              {s.linkUrl ? (
                <a
                  href={s.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold underline decoration-2 underline-offset-2"
                >
                  <Icon name="external-link" className="size-4" /> Open submission
                </a>
              ) : null}

              <GradeForm
                submissionId={s.id}
                maxPoints={s.grade?.maxPoints ?? assignment.maxPoints}
                initialPoints={s.grade?.points ?? null}
                initialFeedback={s.grade?.feedback ?? null}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
