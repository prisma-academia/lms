"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Card } from "@/components/shell";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/ui/empty-state";
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
      <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-border bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${rate}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs font-bold">{rate}%</span>
    </div>
  );
}

const columns: ColumnDef<LessonStatRow, unknown>[] = [
  { accessorKey: "title", header: "Lesson" },
  {
    accessorKey: "group",
    header: "Group",
    cell: (info) => <span className="text-xs text-muted-foreground">{info.getValue() as string}</span>,
  },
  { accessorKey: "completions", header: "Completions" },
  {
    accessorKey: "rate",
    header: "Completion rate",
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <div className="text-xs uppercase text-stone-500">Enrollments</div>
          <div className="mt-1 text-2xl font-semibold">{analytics.totalEnrollments}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-stone-500">Completions</div>
          <div className="mt-1 text-2xl font-semibold">
            {analytics.completions}
            {completionRate != null ? (
              <span className="ml-2 text-sm font-medium text-muted-foreground">
                ({completionRate}%)
              </span>
            ) : null}
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-stone-500">Avg progress</div>
          <div className="mt-1 text-2xl font-semibold">{analytics.avgProgress}%</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-stone-500">New (30 days)</div>
          <div className="mt-1 text-2xl font-semibold">{analytics.newLast30Days}</div>
        </Card>
      </div>

      {analytics.weeklyEnrollments.length > 0 ? (
        <Card>
          <h2 className="text-sm font-semibold uppercase text-stone-500">
            Enrollments — last 90 days
          </h2>
          <div className="mt-4 flex h-28 items-end gap-1.5">
            {analytics.weeklyEnrollments.map((w) => (
              <div
                key={w.weekStart}
                className="flex flex-1 flex-col items-center gap-1"
                title={`Week of ${new Date(w.weekStart).toLocaleDateString()}: ${w.count}`}
              >
                <span className="text-[10px] font-bold text-muted-foreground">
                  {w.count > 0 ? w.count : ""}
                </span>
                <div
                  className="w-full rounded-t-[4px] border-2 border-b-0 border-border bg-primary"
                  style={{ height: `${Math.max(4, (w.count / maxWeekly) * 80)}px` }}
                />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase text-stone-500">
          Lesson completion (drop-off)
        </h2>
        <DataTable
          columns={columns}
          data={rows}
          filterColumnId="title"
          searchPlaceholder="Search lessons…"
          empty={
            <EmptyState icon="chart" title="No lessons yet">
              Lesson-level stats appear once the course has lessons.
            </EmptyState>
          }
        />
      </div>
    </div>
  );
}
