import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { courseAccent, courseIcon } from "@/lib/ui/course-color";
import { formatDateTime, type FormatContext } from "@/lib/format";
import { tenantFormatContext } from "../_lib/format-context";
import { DAY_MS, DUE_TONE_COLOR, daysBetween, dueLabel, zonedParts } from "../_lib/zoned";
import { countOf } from "../_lib/labels";

const SECTION_HEADING = "text-[13px] font-bold text-foreground";

/** "Mon", "Nov" — in the academy's language, for a day that is already a calendar day. */
function partOf(dayNumber: number, part: "weekday" | "month", ctx: FormatContext): string {
  try {
    // The day number IS the calendar day, so it is read back in UTC: applying
    // the academy's zone a second time would shift it.
    return new Intl.DateTimeFormat(ctx.locale ?? "en", { [part]: "short", timeZone: "UTC" }).format(
      new Date(dayNumber * DAY_MS)
    );
  } catch {
    return "";
  }
}

export default async function OverviewPage() {
  const actor = await requireClientPage();
  const now = new Date();
  // Every "today", "this week" and "due in" below is counted in the academy's
  // own time zone, not the server's — see ../_lib/zoned.ts.
  const format = await tenantFormatContext(actor.tenantId);
  const today = zonedParts(now, format.timeZone);

  const enrollments = await prisma.enrollment.findMany({
    where: { clientId: actor.clientId },
    orderBy: { enrolledAt: "desc" },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          lessons: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: { id: true, title: true },
          },
        },
      },
      // Filtered here, once: this array feeds the lessons-completed stat, the
      // streak/activity heatmap and the continue-learning frontier. Row presence
      // now means "opened", so an unfiltered include would count opens as study.
      lessonProgress: {
        where: { completedAt: { not: null } },
        select: { lessonId: true, completedAt: true },
      },
    },
  });

  const courseIds = enrollments.map((e) => e.course.id);
  const assignments = courseIds.length
    ? await prisma.assignment.findMany({
        where: { courseId: { in: courseIds }, NOT: { publishedAt: null } },
        include: {
          course: { select: { id: true, title: true } },
          submissions: { where: { clientId: actor.clientId }, select: { id: true } },
        },
      })
    : [];
  const grades = await prisma.grade.findMany({
    where: { clientId: actor.clientId },
    select: { points: true, maxPoints: true },
  });

  // --- derived stats ---
  const inProgress = enrollments.filter((e) => !e.completedAt).length;
  const lessonsCompleted = enrollments.reduce(
    (s, e) => s + e.lessonProgress.length,
    0
  );
  // Still to hand in, with how many calendar days away each deadline is.
  const outstanding = assignments
    .filter((a) => a.dueAt && a.submissions.length === 0)
    .map((a) => ({ assignment: a, dueAt: a.dueAt!, daysAway: daysBetween(now, a.dueAt!, format.timeZone) }));
  const dueThisWeek = outstanding.filter((o) => o.daysAway >= 0 && o.daysAway <= 7).length;
  const gradeMax = grades.reduce((s, g) => s + g.maxPoints, 0);
  const gradeAvg =
    gradeMax === 0
      ? null
      : Math.round((grades.reduce((s, g) => s + g.points, 0) / gradeMax) * 100);

  // --- activity + streak from lesson completions ---
  const completionDays = enrollments.flatMap((e) =>
    e.lessonProgress
      .map((p) => p.completedAt)
      .filter((d): d is Date => d != null)
      .map((d) => zonedParts(d, format.timeZone).dayNumber)
  );
  const activeDays = new Set(completionDays);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    if (activeDays.has(today.dayNumber - i)) streak++;
    else if (i === 0) continue; // today with no activity yet doesn't break a prior streak
    else break;
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const dayNumber = today.dayNumber - (6 - i);
    return {
      label: partOf(dayNumber, "weekday", format),
      count: completionDays.filter((n) => n === dayNumber).length,
      today: i === 6,
    };
  });
  const maxCount = Math.max(1, ...week.map((w) => w.count));
  const weekTotal = week.reduce((sum, w) => sum + w.count, 0);

  // --- continue learning ---
  const continueList = enrollments
    .filter((e) => !e.completedAt)
    .slice(0, 3)
    .map((e) => {
      const done = new Set(e.lessonProgress.map((p) => p.lessonId));
      const next = e.course.lessons.find((l) => !done.has(l.id));
      return { enrollment: e, next };
    });

  // --- due soon ---
  const dueSoon = outstanding
    .filter((o) => o.daysAway >= 0)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
    .slice(0, 4);

  const greetWord = today.hour < 12 ? "Good morning" : today.hour < 18 ? "Good afternoon" : "Good evening";

  const focus = continueList
    .map((c) => ({
      ...c,
      pct: c.enrollment.progressPercent,
      remaining:
        c.enrollment.course.lessons.length - c.enrollment.lessonProgress.length,
    }))
    .sort((a, b) => b.pct - a.pct)[0];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-balance font-heading text-2xl leading-tight">
          {greetWord}. Ready to learn?
        </h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          {dueThisWeek > 0 ? `${countOf(dueThisWeek, "assignment")} due this week` : "Nothing due this week"}
          {streak > 0 ? ` · ${streak}-day streak` : ""}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon="book"
          iconBg="var(--chart-1)"
          accent="var(--chart-1)"
          value={inProgress}
          label="Courses in progress"
        />
        <StatCard
          icon="check-circle"
          iconBg="var(--chart-2)"
          accent="var(--chart-2)"
          value={lessonsCompleted}
          label="Lessons completed"
        />
        <StatCard
          icon="clock"
          iconBg="var(--chart-3)"
          accent="var(--chart-3)"
          value={dueThisWeek}
          label="Due this week"
        />
        <StatCard
          icon="award"
          iconBg="var(--chart-4)"
          accent="var(--chart-4)"
          value={gradeAvg == null ? "—" : `${gradeAvg}%`}
          label="Grade average"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card accent="var(--chart-1)">
            <div className="mb-4 flex items-baseline justify-between gap-2">
              <h2 className={SECTION_HEADING}>This week</h2>
              <span className="num text-xs font-bold text-muted-foreground">
                {weekTotal > 0 ? countOf(weekTotal, "lesson") : "No lessons yet"}
              </span>
            </div>
            {/* One picture to a screen reader, with the numbers in its name: seven
                unlabelled bars would be seven stops that say nothing. */}
            <div
              role="img"
              aria-label={`Lessons completed in the last 7 days: ${week
                .map((w) => `${w.today ? "today" : w.label} ${w.count}`)
                .join(", ")}.`}
              className="flex h-40 items-end gap-2 sm:gap-3"
            >
              {week.map((w, i) => (
                <div key={i} aria-hidden className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <span className="num text-[11px] font-bold text-muted-foreground">
                    {w.count > 0 ? w.count : ""}
                  </span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t-[8px] border-2 border-border ${
                        w.count === 0
                          ? "border-dashed"
                          : w.today
                            ? "bg-primary shadow-sm"
                            : "bg-chart-1 shadow-sm"
                      }`}
                      style={{
                        height: `${
                          w.count === 0
                            ? 8
                            : Math.max(14, (w.count / maxCount) * 104)
                        }px`,
                      }}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-bold ${w.today ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {w.label}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className={`mb-2 ${SECTION_HEADING}`}>Continue learning</h2>
            {continueList.length === 0 ? (
              <EmptyState
                icon="book"
                title={enrollments.length === 0 ? "No courses yet" : "All caught up"}
                action={
                  <Button asChild size="sm">
                    <Link href="/courses">Browse courses</Link>
                  </Button>
                }
              >
                {enrollments.length === 0
                  ? "Pick a course from the catalogue and it will appear here, with your place saved."
                  : "You have finished every course you enrolled in. Find your next one in the catalogue."}
              </EmptyState>
            ) : (
              <ul className="divide-dash">
                {continueList.map(({ enrollment: e, next }) => {
                  const accent = courseAccent(e.course.id);
                  return (
                    <li key={e.id} className="flex items-center gap-3 py-3">
                      <span
                        aria-hidden
                        className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-foreground text-foreground"
                        style={{ background: accent }}
                      >
                        <Icon name={courseIcon(e.course.id)} className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">
                          {e.course.title}
                        </div>
                        <div className="truncate text-[12.5px] font-medium text-muted-foreground">
                          {next ? `Next: ${next.title}` : "All lessons done"}
                        </div>
                        <ProgressBar
                          value={e.progressPercent}
                          color={accent}
                          size="sm"
                          className="mt-2"
                          label={`Progress in ${e.course.title}`}
                        />
                      </div>
                      <span className="num shrink-0 text-sm font-bold">
                        {e.progressPercent}%
                      </span>
                      <Link
                        href={
                          next
                            ? `/courses/${e.course.slug}/learn?lesson=${next.id}`
                            : `/courses/${e.course.slug}/learn`
                        }
                        aria-label={`Continue ${e.course.title}`}
                        className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border-2 border-border bg-card shadow-sm outline-none [touch-action:manipulation] hover:bg-muted focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-x-px active:translate-y-px active:shadow-none"
                      >
                        <Icon name="arrow-right" className="size-4" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card accent="var(--chart-4)">
            <h2 className={`mb-2 ${SECTION_HEADING}`}>Due soon</h2>
            {dueSoon.length === 0 ? (
              <EmptyState icon="check-circle">
                Nothing is due. New assignments from your courses will show up here.
              </EmptyState>
            ) : (
              <ul className="divide-dash">
                {dueSoon.map(({ assignment: a, dueAt, daysAway }) => {
                  const due = zonedParts(dueAt, format.timeZone);
                  const info = dueLabel(daysAway);
                  const accent = courseAccent(a.course.id);
                  return (
                    <li key={a.id} className="flex items-center gap-3 py-2.5">
                      <div
                        aria-hidden
                        className="num flex size-11 shrink-0 -rotate-3 flex-col items-center justify-center rounded-[10px] border-2 border-foreground leading-none text-foreground"
                        style={{ background: accent }}
                      >
                        <span className="text-[15px] font-bold">{due.day}</span>
                        <span className="mt-0.5 text-[9px] font-bold">
                          {partOf(due.dayNumber, "month", format)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-bold">
                          {a.title}
                        </div>
                        <div className="truncate text-[12px] font-medium text-muted-foreground">
                          {a.course.title}
                        </div>
                      </div>
                      <span
                        className="num shrink-0 text-[12px] font-bold"
                        style={{ color: DUE_TONE_COLOR[info.tone] }}
                      >
                        {info.text}
                        <span className="sr-only">, {formatDateTime(dueAt, format)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              href="/assignments"
              className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-[8px] text-[13px] font-bold underline decoration-primary decoration-2 underline-offset-2 outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              All assignments <Icon name="arrow-right" className="size-3.5" aria-hidden />
            </Link>
          </Card>

          {focus ? (
            <Card accent="var(--foreground)" className="bg-primary text-primary-foreground">
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold">
                <Icon name="target" className="size-4" aria-hidden /> Closest to done
              </h2>
              <p className="text-[13.5px] font-medium leading-relaxed">
                <b>{focus.enrollment.course.title}</b> is {focus.pct}% complete.{" "}
                {focus.remaining > 0
                  ? `${countOf(focus.remaining, "lesson")} to go.`
                  : "One last push to finish it."}
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
