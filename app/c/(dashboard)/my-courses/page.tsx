import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";
import { PageHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { courseAccent, courseIcon } from "@/lib/ui/course-color";

export default async function MyCoursesPage() {
  const actor = await requireClientPage();

  const enrollments = await prisma.enrollment.findMany({
    where: { clientId: actor.clientId },
    orderBy: { enrolledAt: "desc" },
    include: {
      course: { include: { _count: { select: { lessons: true } } } },
    },
  });

  return (
    <div>
      <PageHeader
        title="My courses"
        subtitle={`${enrollments.length} enrolled`}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/courses">
              <Icon name="search" /> Browse catalog
            </Link>
          </Button>
        }
      />

      {enrollments.length === 0 ? (
        <div className="rounded-[14px] border-2 border-ink bg-card p-4 shadow-brutal">
          <EmptyState
            icon="book"
            title="No courses yet"
            action={
              <Button asChild size="sm">
                <Link href="/courses">Explore the catalog</Link>
              </Button>
            }
          >
            You are not enrolled in any courses yet.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {enrollments.map((e) => {
            const { course } = e;
            const accent = courseAccent(course.id);
            const thumb =
              course.thumbnailKey && s3Configured()
                ? publicUrlForKey(course.thumbnailKey)
                : null;
            const done = e.completedAt != null;

            return (
              <div
                key={e.id}
                className="flex flex-col rounded-[14px] border-2 border-ink bg-card p-4 transition-transform duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5"
                style={{ boxShadow: `6px 6px 0 ${accent}` }}
              >
                <div className="flex items-start gap-3">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="h-16 w-24 shrink-0 rounded-[10px] border-2 border-ink object-cover"
                    />
                  ) : (
                    <span
                      className="flex size-12 shrink-0 items-center justify-center rounded-[10px] border-2 border-ink text-ink"
                      style={{ background: accent }}
                    >
                      <Icon name={courseIcon(course.id)} className="size-6" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/courses/${course.slug}`}
                      className="line-clamp-2 font-heading text-[15px] leading-tight hover:underline"
                    >
                      {course.title}
                    </Link>
                    <p className="mt-1 text-[12px] font-medium text-ink/60">
                      {course._count.lessons} lessons
                    </p>
                  </div>
                  {done ? (
                    <Badge color="var(--green)" rotate>
                      Done
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-[12px] font-bold text-ink/60">
                    <span>{done ? "Completed" : "Progress"}</span>
                    <span className="num text-ink">{e.progressPercent}%</span>
                  </div>
                  <ProgressBar value={e.progressPercent} color={accent} size="sm" />
                </div>

                <Button asChild size="sm" className="mt-4 self-start">
                  <Link href={`/courses/${course.slug}/learn`}>
                    {done ? "Review course" : "Continue learning"}
                    <Icon name="arrow-right" />
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
