import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { NewAssignmentForm } from "./new-assignment-form";

export default async function AdminAssignmentsPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_ASSIGNMENTS_READ.key);

  const [courses, assignments] = await Promise.all([
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
  ]);

  return (
    <div>
      <PageHeader
        title="Assignments"
        subtitle="Create work and grade submissions"
        action={<NewAssignmentForm courses={courses} />}
      />

      {assignments.length === 0 ? (
        <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
          <EmptyState icon="clipboard" title="No assignments yet">
            {courses.length === 0
              ? "Create a course first, then add assignments to it."
              : "Use “New assignment” to create your first one."}
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-3">
          {assignments.map((a) => (
            <Link
              key={a.id}
              href={`/admin/assignments/${a.id}`}
              className="flex items-center gap-3 rounded-[14px] border-2 border-border bg-card p-4 shadow-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-foreground bg-primary text-primary-foreground">
                <Icon name="clipboard" className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-heading text-[15px] leading-tight">
                  {a.title}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-bold text-muted-foreground">
                  <Badge color="var(--chart-1)">{a.course.title}</Badge>
                  {a.publishedAt ? (
                    <Badge color="var(--success)">Published</Badge>
                  ) : (
                    <Badge>Draft</Badge>
                  )}
                  <span className="num">
                    {a._count.submissions} submission
                    {a._count.submissions === 1 ? "" : "s"}
                  </span>
                  {a.dueAt ? (
                    <span className="num">
                      · due {a.dueAt.toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              </div>
              <Icon name="chevron-right" className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
