import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Icon } from "@/components/icon";
import { CourseEnrollButton } from "../enroll-button";
import { courseAccent, courseIcon } from "@/lib/ui/course-color";

function formatPrice(cents: number | null, currency: string): string {
  if (cents == null || cents === 0) return "Free";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const actor = await requireClientPage();
  const { slug } = await params;

  const course = await prisma.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: {
      lessons: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, durationMin: true },
      },
    },
  });
  if (!course) notFound();

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      courseId_clientId: { courseId: course.id, clientId: actor.clientId },
    },
    include: { lessonProgress: { select: { lessonId: true } } },
  });

  const enrolled = enrollment != null;
  const doneSet = new Set(enrollment?.lessonProgress.map((p) => p.lessonId) ?? []);
  const totalDuration = course.lessons.reduce(
    (sum, l) => sum + (l.durationMin ?? 0),
    0
  );
  const accent = courseAccent(course.id);

  return (
    <div className="max-w-3xl">
      <Link
        href="/courses"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-muted-foreground hover:text-foreground"
      >
        <Icon name="arrow-left" className="size-4" /> Catalog
      </Link>

      <div
        className="rounded-[14px] border-2 border-border bg-card p-5"
        style={{ boxShadow: `6px 6px 0 ${accent}` }}
      >
        <div className="flex items-start gap-4">
          <span
            className="flex size-14 shrink-0 items-center justify-center rounded-[12px] border-2 border-border text-foreground"
            style={{ background: accent }}
          >
            <Icon name={courseIcon(course.id)} className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-2xl leading-tight">{course.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] font-bold text-muted-foreground">
              <Badge color={course.priceCents ? "var(--warning)" : "var(--success)"}>
                {formatPrice(course.priceCents, course.currency)}
              </Badge>
              <span>{course.lessons.length} lessons</span>
              {totalDuration > 0 ? <span>· ~{totalDuration} min</span> : null}
            </div>
          </div>
        </div>

        {course.description ? (
          <p className="mt-4 text-sm font-medium leading-relaxed text-foreground">
            {course.description}
          </p>
        ) : null}

        {enrolled ? (
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[12px] font-bold text-muted-foreground">
              <span>{enrollment.completedAt ? "Completed" : "Your progress"}</span>
              <span className="num text-foreground">{enrollment.progressPercent}%</span>
            </div>
            <ProgressBar value={enrollment.progressPercent} color={accent} size="sm" />
          </div>
        ) : null}

        <div className="mt-5 border-t-2 border-dashed border-border pt-5">
          <CourseEnrollButton
            slug={course.slug}
            priceCents={course.priceCents}
            enrolled={enrolled}
          />
        </div>
      </div>

      <h2 className="mb-3 mt-6 text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        Lessons
      </h2>
      <div className="rounded-[14px] border-2 border-border bg-card p-2 shadow-md">
        {course.lessons.length === 0 ? (
          <p className="p-4 text-sm font-medium text-muted-foreground">
            No lessons published yet.
          </p>
        ) : (
          <ul className="divide-dash">
            {course.lessons.map((lesson, i) => {
              const done = doneSet.has(lesson.id);
              return (
                <li
                  key={lesson.id}
                  className="flex items-center gap-3 px-2 py-3 text-sm"
                >
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-[8px] border-2 border-border text-[12px] font-bold ${
                      done ? "bg-success text-success-foreground" : "bg-card text-muted-foreground"
                    }`}
                  >
                    {done ? <Icon name="check" className="size-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 font-medium">{lesson.title}</span>
                  {lesson.durationMin != null ? (
                    <span className="num shrink-0 text-[12px] font-bold text-muted-foreground">
                      {lesson.durationMin} min
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {enrolled ? (
        <Button asChild className="mt-6">
          <Link href={`/courses/${course.slug}/learn`}>
            Go to course player <Icon name="arrow-right" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
