import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { NewAssignmentForm } from "./new-assignment-form";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function AdminAssignmentsPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_ASSIGNMENTS_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_ASSIGNMENTS_WRITE.key);

  const [courses, assignments, when] = await Promise.all([
    prisma.course.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.assignment.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        course: { select: { title: true } },
        _count: { select: { submissions: true } },
      },
    }),
    tenantFormatContext(actor.tenantId),
  ]);

  return (
    <div>
      <PageHeader
        title="Assignments"
        subtitle="Set work for a course, then mark what learners hand in."
        action={canWrite ? <NewAssignmentForm courses={courses} /> : undefined}
      />

      {assignments.length === 0 ? (
        <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
          <EmptyState
            icon="clipboard"
            title="No assignments yet"
            action={
              courses.length === 0 && hasPermission(actor, PERMISSIONS.TENANT_COURSES_WRITE.key) ? (
                <Button asChild>
                  <Link href="/admin/courses/new">Create a course</Link>
                </Button>
              ) : undefined
            }
          >
            {courses.length === 0
              ? "An assignment belongs to a course, so create a course first."
              : canWrite
                ? "Use “New assignment” above to set the first piece of work."
                : "Assignments set for your courses will be listed here."}
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3">
          {assignments.map((a) => (
            <li key={a.id}>
              <Link
                href={`/admin/assignments/${a.id}`}
                className="flex items-center gap-3 rounded-[14px] border-2 border-border bg-card p-4 shadow-sm outline-none transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-foreground bg-primary text-primary-foreground"
                >
                  <Icon name="clipboard" className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-[15px] leading-tight">{a.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-bold text-muted-foreground">
                    <Badge color="var(--chart-1)" className="max-w-full">
                      <span className="min-w-0 truncate">{a.course.title}</span>
                    </Badge>
                    {a.publishedAt ? <Badge color="var(--success)">Published</Badge> : <Badge>Draft</Badge>}
                    <span className="num">
                      {a._count.submissions} submission
                      {a._count.submissions === 1 ? "" : "s"}
                    </span>
                    {a.dueAt ? <span className="num">· due {formatDate(a.dueAt, when)}</span> : null}
                  </div>
                </div>
                <Icon name="chevron-right" aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
