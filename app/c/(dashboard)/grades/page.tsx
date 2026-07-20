import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { courseAccent } from "@/lib/ui/course-color";

export default async function GradesPage() {
  const actor = await requireClientPage();

  const grades = await prisma.grade.findMany({
    where: { clientId: actor.clientId },
    orderBy: { gradedAt: "desc" },
    include: {
      submission: {
        include: { assignment: { select: { title: true, courseId: true } } },
      },
    },
  });

  const courseIds = Array.from(new Set(grades.map((g) => g.courseId)));
  const courses = courseIds.length
    ? await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true },
      })
    : [];
  const courseMap = new Map(courses.map((c) => [c.id, c.title]));

  const byCourse = courseIds
    .map((courseId) => {
      const rows = grades.filter((g) => g.courseId === courseId);
      const totalPoints = rows.reduce((s, g) => s + g.points, 0);
      const totalMax = rows.reduce((s, g) => s + g.maxPoints, 0);
      const average = totalMax === 0 ? 0 : Math.round((totalPoints / totalMax) * 100);
      return {
        courseId,
        title: courseMap.get(courseId) ?? "Course",
        average,
        count: rows.length,
      };
    })
    .sort((a, b) => b.average - a.average);

  const totalPoints = grades.reduce((s, g) => s + g.points, 0);
  const totalMax = grades.reduce((s, g) => s + g.maxPoints, 0);
  const overall = totalMax === 0 ? 0 : Math.round((totalPoints / totalMax) * 100);
  const top = byCourse[0];

  return (
    <div>
      <PageHeader title="Grades" subtitle="How you're doing this term" />

      {grades.length === 0 ? (
        <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
          <EmptyState icon="award" title="No grades yet">
            Submit assignments and your grades will show up here.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="flex flex-col items-center gap-4 rounded-[14px] border-2 border-border bg-card p-6 text-center shadow-md">
            <div
              className="-rotate-3 rounded-[14px] px-7 py-4 text-center"
              style={{ border: "6px double #00975A", color: "#00975A" }}
            >
              <span className="num block font-heading text-[44px] leading-none">
                {overall}%
              </span>
              <span className="mt-1.5 block text-[10.5px] font-bold uppercase tracking-[0.14em]">
                Term average
              </span>
            </div>
            <p className="text-[12.5px] font-medium text-muted-foreground">
              Across {byCourse.length} course{byCourse.length === 1 ? "" : "s"} ·{" "}
              {grades.length} graded task{grades.length === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-[14px] border-2 border-border bg-card p-5 shadow-md">
              <h3 className="mb-3 text-[12px] font-bold uppercase tracking-[0.1em]">
                By course
              </h3>
              <div className="divide-dash">
                {byCourse.map((c) => (
                  <div key={c.courseId} className="flex items-center gap-3 py-2.5">
                    <span className="w-36 shrink-0 truncate text-[13.5px] font-bold sm:w-44">
                      {c.title}
                    </span>
                    <ProgressBar
                      value={c.average}
                      color={courseAccent(c.courseId)}
                      size="sm"
                      className="flex-1"
                    />
                    <span className="num w-11 shrink-0 text-right text-[13.5px] font-bold">
                      {c.average}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {top ? (
              <div
                className="flex items-center gap-3 rounded-[14px] border-2 border-border bg-card p-4"
                style={{ boxShadow: "5px 5px 0 var(--warning)" }}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border-2 border-foreground bg-warning text-warning-foreground">
                  <Icon name="award" className="size-5" />
                </span>
                <div className="min-w-0">
                  <b className="block text-[13.5px] font-bold">
                    Top course — {top.title}
                  </b>
                  <span className="num text-[12.5px] font-medium text-muted-foreground">
                    {top.average}% average across {top.count} task
                    {top.count === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
