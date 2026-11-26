"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Card } from "@/components/shell";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import type { CourseAnalytics, CourseInitial } from "./course-types";

type LessonStatRow = {
  id: string;
  title: string;
  group: string;
  contentType: string;
  completions: number;
  /** 0-100, or null when there are no enrollments to compute a rate against. */
  rate: number | null;
};

function RateBar({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex min-w-32 items-center gap-2">
      {/* The number beside it is the value; the bar is the same value drawn. */}
      <div aria-hidden className="h-2.5 flex-1 overflow-hidden rounded-full border border-border bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${rate}%` }} />
      </div>
      <span className="num w-9 shrink-0 text-right text-xs font-bold">{rate}%</span>
    </div>
  );
}

const columns: ColumnDef<LessonStatRow, unknown>[] = [
  {
    accessorKey: "title",
    header: "Lesson",
    cell: (info) => (
      <span className="block min-w-40 max-w-md truncate font-bold text-foreground">
        {info.getValue() as string}
      </span>
    ),
  },
  {
    accessorKey: "group",
    header: "Module",
    cell: (info) => (
      <span className="text-xs font-medium text-muted-foreground">{info.getValue() as string}</span>
    ),
  },
  {
    accessorKey: "completions",
    header: "Finished by",
    cell: (info) => <span className="num">{info.getValue() as number}</span>,
  },
  {
    accessorKey: "rate",
    header: "Share of learners",
    cell: (info) => <RateBar rate={info.getValue() as number | null} />,
  },
];

export function CourseAnalyticsTab({
  initial,
  analytics,
}: {
  initial: CourseInitial;
  analytics: CourseAnalytics;
}) {
  const completionRate =
    analytics.totalEnrollments > 0
      ? Math.round((analytics.completions / analytics.totalEnrollments) * 100)
      : null;

  const statsByLesson = new Map(analytics.lessonStats.map((s) => [s.lessonId, s.completions]));
  const groupTitle = (id: string | null) =>
    id ? initial.lessonGroups.find((g) => g.id === id)?.title ?? "—" : "—";

  const rows: LessonStatRow[] = initial.lessons.map((l) => {
    const completions = statsByLesson.get(l.id) ?? 0;
    return {
      id: l.id,
      title: l.title,
      group: groupTitle(l.groupId),
      contentType: l.contentType,
      completions,
      rate:
        analytics.totalEnrollments > 0
          ? Math.round((completions / analytics.totalEnrollments) * 100)
          : null,
    };
  });

  const maxWeekly = Math.max(1, ...analytics.weeklyEnrollments.map((w) => w.count));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="users" iconBg="var(--chart-1)" value={analytics.totalEnrollments} label="Learners enrolled" />
        <StatCard
          icon="check-circle"
          iconBg="var(--chart-2)"
          value={analytics.completions}
          label="Finished the course"
          delta={completionRate != null ? `${completionRate}%` : undefined}
        />
        <StatCard icon="trending-up" iconBg="var(--chart-3)" value={`${analytics.avgProgress}%`} label="Average progress" />
        <StatCard icon="plus" iconBg="var(--chart-4)" value={analytics.newLast30Days} label="Joined in the last 30 days" />
      </div>

      {analytics.weeklyEnrollments.length > 0 ? (
        <Card>
          <h2 className="font-heading text-lg leading-tight">New enrollments each week</h2>
          <p className="mt-1 text-[13px] font-medium text-muted-foreground">
            The last 13 weeks, oldest on the left.
          </p>
          {/* A list, so each week is announced with its date and its count; the
              columns are the same numbers drawn. One hue: one series. */}
          <ol
            aria-label="New enrollments per week"
            className="mt-4 flex h-32 items-end gap-1.5"
          >
            {analytics.weeklyEnrollments.map((w) => (
              <li
                key={w.weekStart}
                className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                title={`Week of ${w.weekLabel}: ${w.count}`}
              >
                <span className="sr-only">
                  Week of {w.weekLabel}: {w.count}
                </span>
                <span aria-hidden className="num text-[10px] font-bold text-muted-foreground">
                  {w.count > 0 ? w.count : ""}
                </span>
                <span
                  aria-hidden
                  className={
                    w.count > 0
                      ? "block w-full max-w-6 rounded-t-[4px] bg-primary"
                      : "block w-full max-w-6 rounded-t-[2px] bg-border"
                  }
                  style={{ height: `${w.count > 0 ? Math.max(6, (w.count / maxWeekly) * 88) : 2}px` }}
                />
              </li>
            ))}
          </ol>
          <div className="num mt-2 flex justify-between text-[11px] font-medium text-muted-foreground">
            <span>{analytics.weeklyEnrollments[0].weekLabel}</span>
            <span>{analytics.weeklyEnrollments[analytics.weeklyEnrollments.length - 1].weekLabel}</span>
          </div>
        </Card>
      ) : null}

      <div>
        <h2 className="font-heading text-lg leading-tight">Where learners stop</h2>
        <p className="mb-3 mt-1 text-[13px] font-medium text-muted-foreground">
          How many enrolled learners have finished each lesson. A sharp drop from one lesson to the
          next is where people are getting stuck.
        </p>
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Search lessons…"
          empty={
            <EmptyState icon="chart" title="No lessons yet">
              Add lessons on the Content tab; each one is listed here with how many learners have
              finished it.
            </EmptyState>
          }
        />
      </div>
    </div>
  );
}
