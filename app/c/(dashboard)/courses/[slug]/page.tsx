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
import { isUnlocked, frontierLesson } from "@/lib/courses/gating";
import { ShareDialog } from "@/components/share/share-dialog";
import { requestOrigin } from "@/lib/site/metadata";
import { formatDuration, formatPrice, isPaid, plural } from "@/lib/site/public-format";
import { tenantFormatContext } from "../../_lib/format-context";

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
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, title: true, durationMin: true },
      },
    },
  });
  if (!course) notFound();

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      courseId_clientId: { courseId: course.id, clientId: actor.clientId },
    },
    // completedAt filter: row presence now means "opened", not "completed".
    include: {
      lessonProgress: { where: { completedAt: { not: null } }, select: { lessonId: true } },
    },
  });

  const enrolled = enrollment != null;
  const doneSet = new Set(enrollment?.lessonProgress.map((p) => p.lessonId) ?? []);
  // Same predicate the learn API enforces, so the syllabus can't promise access
  // the player then refuses.
  const nextLesson = enrolled ? frontierLesson(course.lessons, doneSet) : null;
  const totalDuration = course.lessons.reduce(
    (sum, l) => sum + (l.durationMin ?? 0),
    0
  );
  const accent = courseAccent(course.id);
  // The academy's locale, not the server's: the price reads the way learners
  // write it, whatever machine rendered the page.
  const { locale } = await tenantFormatContext(actor.tenantId);
  const priceLabel = formatPrice(course.priceCents, course.currency, locale);
  const paid = isPaid(course.priceCents);
  const completedCount = course.lessons.filter((l) => doneSet.has(l.id)).length;
  // Only a course that has a public page is worth sharing: a private one would
  // show the person receiving the link a "page not found".
  const shareUrl =
    course.visibility === "PUBLIC"
      ? new URL(`/courses/${course.slug}`, await requestOrigin()).toString()
      : null;

  return (
    <div className="max-w-3xl">
      <Link
        href="/courses"
        className="mb-4 inline-flex min-h-9 items-center gap-1.5 rounded-[8px] text-[13px] font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Icon name="arrow-left" className="size-4" aria-hidden /> All courses
      </Link>

      <div
        className="rounded-[14px] border-2 border-border bg-card p-5"
        style={{ boxShadow: `6px 6px 0 ${accent}` }}
      >
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-[12px] border-2 border-border text-foreground"
            style={{ background: accent }}
          >
            <Icon name={courseIcon(course.id)} className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-balance break-words font-heading text-2xl leading-tight">{course.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] font-bold text-muted-foreground">
              {enrolled ? (
                <Badge color={enrollment.completedAt ? "var(--success)" : "var(--info)"}>
                  {enrollment.completedAt ? "Completed" : "Enrolled"}
                </Badge>
              ) : (
                <Badge color={paid ? "var(--warning)" : "var(--success)"}>{priceLabel}</Badge>
              )}
              <span>{plural(course.lessons.length, "lesson")}</span>
              {totalDuration > 0 ? <span>· about {formatDuration(totalDuration)}</span> : null}
            </div>
          </div>
        </div>

        {course.description ? (
          <p className="mt-4 max-w-[68ch] whitespace-pre-line break-words text-sm font-medium leading-relaxed text-foreground">
            {course.description}
          </p>
        ) : null}

        {enrolled ? (
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[12px] font-bold text-muted-foreground">
              <span>{enrollment.completedAt ? "Completed" : "Your progress"}</span>
              <span className="num text-foreground">{enrollment.progressPercent}%</span>
            </div>
            <ProgressBar
              value={enrollment.progressPercent}
              color={accent}
              size="sm"
              label="Your progress in this course"
            />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-border pt-5">
          {enrolled ? (
            // One way in, and it says where it leads: the next lesson by name.
            <Button asChild className="min-h-11 max-w-full sm:min-h-0">
              <Link
                href={
                  nextLesson
                    ? `/courses/${course.slug}/learn?lesson=${nextLesson.id}`
                    : `/courses/${course.slug}/learn`
                }
              >
                <span className="truncate">
                  {nextLesson && !doneSet.has(nextLesson.id)
                    ? `${completedCount > 0 ? "Continue" : "Start"}: ${nextLesson.title}`
                    : "Review the course"}
                </span>
                <Icon name="arrow-right" aria-hidden />
              </Link>
            </Button>
          ) : (
            <CourseEnrollButton
              slug={course.slug}
              priceCents={course.priceCents}
              priceLabel={priceLabel}
              enrolled={false}
            />
          )}
          {shareUrl ? <ShareDialog url={shareUrl} title={course.title} /> : null}
        </div>
      </div>

      <h2 className="mb-3 mt-6 flex items-baseline justify-between gap-3 font-heading text-lg leading-tight">
        Lessons
        {enrolled ? (
          <span className="num font-sans text-[12px] font-bold text-muted-foreground">
            {completedCount} of {course.lessons.length} done
          </span>
        ) : null}
      </h2>
      <div className="rounded-[14px] border-2 border-border bg-card p-2 shadow-md">
        {course.lessons.length === 0 ? (
          <p className="p-4 text-sm font-medium text-muted-foreground">
            No lessons published yet.
          </p>
        ) : (
          <ol className="divide-dash">
            {course.lessons.map((lesson, i) => {
              const done = doneSet.has(lesson.id);
              const locked = enrolled && !isUnlocked(course.lessons, doneSet, lesson.id);
              // An enrolled learner can go straight to any lesson that is open
              // to them. The player enforces the same rule; this only saves a step.
              const openable = enrolled && !locked;
              return (
                <li
                  key={lesson.id}
                  className={`flex min-h-12 items-center gap-3 px-2 py-2.5 text-sm ${
                    locked ? "text-muted-foreground" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className={`num flex size-7 shrink-0 items-center justify-center rounded-[8px] border-2 border-border text-[12px] font-bold ${
                      done ? "bg-success text-success-foreground" : "bg-card text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <Icon name="check" className="size-3.5" />
                    ) : locked ? (
                      <Icon name="lock" className="size-3.5" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="min-w-0 flex-1 break-words font-medium">
                    {openable ? (
                      <Link
                        href={`/courses/${course.slug}/learn?lesson=${lesson.id}`}
                        className="rounded-[4px] outline-none hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {lesson.title}
                      </Link>
                    ) : (
                      lesson.title
                    )}
                    {done ? <span className="sr-only"> (completed)</span> : null}
                  </span>
                  {locked ? (
                    <span className="shrink-0 text-[12px] font-bold text-muted-foreground">
                      Locked
                    </span>
                  ) : lesson.durationMin != null ? (
                    <span className="num shrink-0 text-[12px] font-bold text-muted-foreground">
                      {lesson.durationMin} min
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {enrolled && course.lessons.some((l) => !isUnlocked(course.lessons, doneSet, l.id)) ? (
        <p className="mt-3 flex items-start gap-1.5 text-[13px] font-medium text-muted-foreground">
          <Icon name="lock" className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Lessons open in order: finish one to unlock the next.
        </p>
      ) : null}
    </div>
  );
}
