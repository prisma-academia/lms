import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { Card } from "@/components/shell";
import { StatCard } from "@/components/ui/stat-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { courseAccent, courseIcon } from "@/lib/ui/course-color";

const DAY_MS = 86400000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dueInfo(due: Date, now: Date): { text: string; color: string } {
  const days = Math.round(
    (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      DAY_MS
  );
  if (days < 0) return { text: "Past due", color: "var(--ink-35)" };
  if (days === 0) return { text: "Due today", color: "var(--red)" };
  if (days === 1) return { text: "Due tomorrow", color: "var(--red)" };
  if (days <= 4) return { text: `Due in ${days} days`, color: "var(--orange)" };
  return { text: `Due in ${days} days`, color: "var(--ink-60)" };
}

export default async function OverviewPage() {
  const actor = await requireClientPage();
  const now = new Date();

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
            orderBy: { sortOrder: "asc" },
            select: { id: true, title: true },
          },
        },
      },
      lessonProgress: { select: { lessonId: true, completedAt: true } },
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
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAhead = new Date(startOfToday.getTime() + 7 * DAY_MS);
  const dueThisWeek = assignments.filter(
    (a) =>
      a.dueAt &&
      a.submissions.length === 0 &&
      a.dueAt >= startOfToday &&
      a.dueAt <= weekAhead
  ).length;
  const gradeMax = grades.reduce((s, g) => s + g.maxPoints, 0);
  const gradeAvg =
    gradeMax === 0
      ? null
      : Math.round((grades.reduce((s, g) => s + g.points, 0) / gradeMax) * 100);

  // --- activity + streak from lesson completions ---
  const completions = enrollments.flatMap((e) =>
    e.lessonProgress.map((p) => p.completedAt)
  );
  const activeDays = new Set(completions.map((d) => dayKey(new Date(d))));
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(startOfToday.getTime() - i * DAY_MS);
    if (activeDays.has(dayKey(d))) streak++;
    else if (i === 0) continue; // today with no activity yet doesn't break a prior streak
    else break;
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfToday.getTime() - (6 - i) * DAY_MS);
    const count = completions.filter(
      (c) => dayKey(new Date(c)) === dayKey(d)
    ).length;
    return { label: WEEKDAYS[d.getDay()], count, today: i === 6 };
  });
  const maxCount = Math.max(1, ...week.map((w) => w.count));

  // --- continue learning ---
  const continueList = enrollments
    .filter((e) => !e.completedAt)
    .slice(0, 3)
    .map((e) => {
      const done = new Set(e.lessonProgress.map((p) => p.lessonId));
      const next = e.course.lessons.find((l) => !done.has(l.id));
      return { enrollment: e, next };
    });

  // --- due radar ---
  const radar = assignments
    .filter((a) => a.dueAt && a.submissions.length === 0 && a.dueAt >= startOfToday)
    .sort((a, b) => (a.dueAt!.getTime() - b.dueAt!.getTime()))
    .slice(0, 4);

  const hour = now.getHours();
  const greetWord = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

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
        <h1 className="font-heading text-2xl leading-tight">
          {greetWord}. Ready to learn?
        </h1>
        <p className="mt-1 text-sm font-medium text-ink/60">
          {dueThisWeek > 0
            ? `${dueThisWeek} task${dueThisWeek === 1 ? "" : "s"} due this week`
            : "Nothing due this week"}
          {streak > 0 ? ` · ${streak}-day streak` : ""}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon="book"
          iconBg="var(--purple)"
          accent="var(--purple)"
          value={inProgress}
          label="Courses in progress"
        />
        <StatCard
          icon="check-circle"
          iconBg="var(--green)"
          accent="var(--green)"
          value={lessonsCompleted}
          label="Lessons completed"
        />
        <StatCard
          icon="clock"
          iconBg="var(--orange)"
          accent="var(--orange)"
          value={dueThisWeek}
          label="Due this week"
        />
        <StatCard
          icon="award"
          iconBg="var(--blue)"
          accent="var(--blue)"
          value={gradeAvg == null ? "—" : `${gradeAvg}%`}
          label="Grade average"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card accent="var(--purple)">
            <h3 className="mb-4 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em]">
              This week
              <span className="num ml-auto text-xs font-bold normal-case tracking-normal text-ink/60">
                {lessonsCompleted > 0
                  ? `${completions.filter((c) => new Date(c) >= new Date(startOfToday.getTime() - 6 * DAY_MS)).length} lessons`
                  : "no activity yet"}
              </span>
            </h3>
            <div className="flex h-40 items-end gap-2 sm:gap-3">
              {week.map((w, i) => (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t-[8px] border-2 border-ink ${
                        w.count === 0
                          ? "border-dashed border-ink/35"
                          : w.today
                            ? "bg-pink shadow-brutal-sm"
                            : "bg-purple shadow-brutal-sm"
                      }`}
                      style={{
                        height: `${
                          w.count === 0
                            ? 8
                            : Math.max(14, (w.count / maxCount) * 120)
                        }px`,
                      }}
                      title={`${w.count} lesson${w.count === 1 ? "" : "s"}`}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-bold ${w.today ? "text-ink" : "text-ink/50"}`}
                  >
                    {w.label}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em]">
              Jump back in
            </h3>
            {continueList.length === 0 ? (
              <EmptyState icon="book" title="No active courses">
                Browse the catalog and enroll to get started.
              </EmptyState>
            ) : (
              <div className="divide-dash">
                {continueList.map(({ enrollment: e, next }) => {
                  const accent = courseAccent(e.course.id);
                  return (
                    <div key={e.id} className="flex items-center gap-3 py-3">
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-ink text-ink"
                        style={{ background: accent }}
                      >
                        <Icon name={courseIcon(e.course.id)} className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">
                          {e.course.title}
                        </div>
                        <div className="truncate text-[12.5px] font-medium text-ink/60">
                          {next ? `Next: ${next.title}` : "All lessons done"}
                        </div>
                        <ProgressBar
                          value={e.progressPercent}
                          color={accent}
                          size="sm"
                          className="mt-2"
                        />
                      </div>
                      <span className="num text-sm font-bold">
                        {e.progressPercent}%
                      </span>
                      <Link
                        href={`/courses/${e.course.slug}/learn`}
                        aria-label={`Resume ${e.course.title}`}
                        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-ink bg-card shadow-brutal-sm [touch-action:manipulation] active:translate-x-px active:translate-y-px active:shadow-none"
                      >
                        <Icon name="arrow-right" className="size-4" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card accent="var(--blue)">
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em]">
              Due radar
            </h3>
            {radar.length === 0 ? (
              <EmptyState icon="check-circle">
                Radar&rsquo;s clear. Enjoy it.
              </EmptyState>
            ) : (
              <div className="divide-dash">
                {radar.map((a) => {
                  const info = dueInfo(a.dueAt!, now);
                  const accent = courseAccent(a.course.id);
                  return (
                    <div key={a.id} className="flex items-center gap-3 py-2.5">
                      <div
                        className="num flex size-11 shrink-0 -rotate-3 flex-col items-center justify-center rounded-[10px] border-2 border-ink leading-none"
                        style={{ background: accent }}
                      >
                        <span className="text-[15px] font-bold">
                          {a.dueAt!.getDate()}
                        </span>
                        <span className="mt-0.5 text-[9px] font-bold uppercase">
                          {MONTHS[a.dueAt!.getMonth()]}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-bold">
                          {a.title}
                        </div>
                        <div className="truncate text-[12px] font-medium text-ink/60">
                          {a.course.title}
                        </div>
                      </div>
                      <span
                        className="num shrink-0 text-[12px] font-bold"
                        style={{ color: info.color }}
                      >
                        {info.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <Link
              href="/assignments"
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold underline decoration-pink decoration-2 underline-offset-2"
            >
              All tasks <Icon name="arrow-right" className="size-3.5" />
            </Link>
          </Card>

          {focus ? (
            <Card accent="var(--ink)" className="bg-yellow">
              <h3 className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em]">
                <Icon name="target" className="size-4" /> Closest to done
              </h3>
              <p className="text-[13.5px] font-medium leading-relaxed">
                <b>{focus.enrollment.course.title}</b> is {focus.pct}% in.{" "}
                {focus.remaining > 0
                  ? `${focus.remaining} lesson${focus.remaining === 1 ? "" : "s"} and it's off your plate for good.`
                  : "One last push to wrap it up."}
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
