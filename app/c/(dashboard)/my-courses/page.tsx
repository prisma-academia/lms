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
import { CheckoutVerifier } from "@/components/billing/checkout-verifier";
import { countOf } from "../_lib/labels";

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
      <CheckoutVerifier successMessage="You're enrolled! 🎉" />
      <PageHeader
        title="My courses"
        subtitle={
          enrollments.length === 0
            ? "Courses you enrol in appear here"
            : `${countOf(enrollments.length, "course")} you're enrolled in`
        }
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/courses">
              <Icon name="search" aria-hidden /> Browse courses
            </Link>
          </Button>
        }
      />

      {enrollments.length === 0 ? (
        <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
          <EmptyState
            icon="book"
            title="No courses yet"
            action={
              <Button asChild size="sm">
                <Link href="/courses">Browse courses</Link>
              </Button>
            }
          >
            Pick a course to start. It will show up here with your progress, so you can carry on
            where you left off.
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
              <article
                key={e.id}
                className="flex min-w-0 flex-col rounded-[14px] border-2 border-border bg-card p-4 transition-transform duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5"
                style={{ boxShadow: `6px 6px 0 ${accent}` }}
              >
                <div className="flex items-start gap-3">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      width={96}
                      height={64}
                      loading="lazy"
                      decoding="async"
                      className="h-16 w-24 shrink-0 rounded-[10px] border-2 border-border object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex size-12 shrink-0 items-center justify-center rounded-[10px] border-2 border-border text-foreground"
                      style={{ background: accent }}
                    >
                      <Icon name={courseIcon(course.id)} className="size-6" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="font-heading text-[15px] leading-tight">
                      <Link
                        href={`/courses/${course.slug}`}
                        className="line-clamp-2 break-words rounded-[4px] outline-none hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {course.title}
                      </Link>
                    </h2>
                    <p className="mt-1 text-[12px] font-medium text-muted-foreground">
                      {countOf(course._count.lessons, "lesson")}
                    </p>
                  </div>
                  {done ? (
                    <Badge color="var(--success)" rotate>
                      Completed
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-[12px] font-bold text-muted-foreground">
                    <span>{done ? "Completed" : "Progress"}</span>
                    <span className="num text-foreground">{e.progressPercent}%</span>
                  </div>
                  <ProgressBar
                    value={e.progressPercent}
                    color={accent}
                    size="sm"
                    label={`Progress in ${course.title}`}
                  />
                </div>

                <Button asChild className="mt-4 min-h-11 w-full sm:min-h-0 sm:w-auto sm:self-start">
                  <Link href={`/courses/${course.slug}/learn`}>
                    {done ? "Review course" : e.progressPercent > 0 ? "Continue learning" : "Start course"}
                    <span className="sr-only">: {course.title}</span>
                    <Icon name="arrow-right" aria-hidden />
                  </Link>
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
