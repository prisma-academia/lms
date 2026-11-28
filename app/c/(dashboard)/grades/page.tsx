import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { courseAccent } from "@/lib/ui/course-color";
import { formatDate } from "@/lib/format";
import { tenantFormatContext } from "../_lib/format-context";
import { countOf } from "../_lib/labels";

const SECTION_HEADING = "mb-3 text-[13px] font-bold text-foreground";

/** How many individual marks to list; the per-course averages cover the rest. */
const RECENT_LIMIT = 20;

export default async function GradesPage() {
  const actor = await requireClientPage();

  const [grades, format, examAttempts, quizAttempts] = await Promise.all([
    prisma.grade.findMany({
      where: { clientId: actor.clientId },
      orderBy: { gradedAt: "desc" },
      include: {
        submission: {
          include: { assignment: { select: { title: true, courseId: true } } },
        },
      },
    }),
    tenantFormatContext(actor.tenantId),
    // Released CBT results only: an unreleased score is not the learner's yet.
    prisma.examAttempt.findMany({
      where: { candidate: { clientId: actor.clientId }, releasedAt: { not: null }, gradingStatus: "GRADED" },
      orderBy: { submittedAt: "desc" },
      take: 50,
      select: {
        id: true,
        examId: true,
        scorePercent: true,
        grade: true,
        passed: true,
        submittedAt: true,
        exam: { select: { title: true, reviewMode: true } },
      },
    }),
    prisma.quizAttempt.findMany({
      where: { clientId: actor.clientId, gradingStatus: "GRADED", submittedAt: { not: null } },
      orderBy: { submittedAt: "desc" },
      take: 200,
      select: { quizId: true, scorePercent: true, passed: true, submittedAt: true, quiz: { select: { title: true } } },
    }),
  ]);

  // Best score per quiz.
  const bestQuiz = new Map<string, (typeof quizAttempts)[number]>();
  for (const a of quizAttempts) {
    const cur = bestQuiz.get(a.quizId);
    if (!cur || (a.scorePercent ?? 0) > (cur.scorePercent ?? 0)) bestQuiz.set(a.quizId, a);
  }
  const quizzes = [...bestQuiz.values()];
  const exams = examAttempts.filter((a) => a.exam.reviewMode !== "NONE");

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
  const recent = grades.slice(0, RECENT_LIMIT);

  return (
    <div>
      <PageHeader title="Grades" subtitle="Your marks across every course" />

      {exams.length > 0 || quizzes.length > 0 ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          {exams.length > 0 ? (
            <section aria-labelledby="grades-exams" className="rounded-[14px] border-2 border-border bg-card p-5 shadow-md">
              <h2 id="grades-exams" className={SECTION_HEADING}>
                Exam results
              </h2>
              <ul className="divide-dash">
                {exams.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <a href={`/exam/${a.examId}/done?attempt=${a.id}`} className="min-w-0">
                      <span className="block break-words text-[13.5px] font-bold underline-offset-4 hover:underline">{a.exam.title}</span>
                      <span className="text-[12px] font-medium text-muted-foreground">
                        {a.submittedAt ? formatDate(a.submittedAt, format) : ""} · {a.passed ? "Passed" : "Not passed"}
                      </span>
                    </a>
                    <span className="num shrink-0 rounded-[8px] border-2 border-border bg-background px-2 py-1 text-[13px] font-bold">
                      {a.scorePercent != null ? `${Math.round(a.scorePercent)}%` : "—"}
                      {a.grade ? ` · ${a.grade}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {quizzes.length > 0 ? (
            <section aria-labelledby="grades-quizzes" className="rounded-[14px] border-2 border-border bg-card p-5 shadow-md">
              <h2 id="grades-quizzes" className={SECTION_HEADING}>
                Quizzes (best score)
              </h2>
              <ul className="divide-dash">
                {quizzes.map((a) => (
                  <li key={a.quizId} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block break-words text-[13.5px] font-bold">{a.quiz.title}</span>
                      <span className="text-[12px] font-medium text-muted-foreground">{a.passed ? "Passed" : "Not passed yet"}</span>
                    </span>
                    <span className="num shrink-0 rounded-[8px] border-2 border-border bg-background px-2 py-1 text-[13px] font-bold">
                      {a.scorePercent ?? 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {grades.length === 0 && (exams.length > 0 || quizzes.length > 0) ? null : grades.length === 0 ? (
        <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
          <EmptyState
            icon="award"
            title="No grades yet"
            action={
              <Button asChild size="sm">
                <Link href="/assignments">See your assignments</Link>
              </Button>
            }
          >
            Once an instructor marks work you have handed in, the mark and any feedback will
            appear here.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="flex flex-col items-center gap-4 rounded-[14px] border-2 border-border bg-card p-6 text-center shadow-md">
            {/* The double rule is drawn in the text colour and tinted with the
                success token, so it holds its contrast in every theme. */}
            <div
              className="-rotate-3 rounded-[14px] px-7 py-4 text-center text-foreground"
              style={{ border: "6px double var(--success)" }}
            >
              <span className="num block font-heading text-[44px] leading-none">
                {overall}%
              </span>
              <span className="mt-1.5 block text-[12px] font-bold">Overall average</span>
            </div>
            <p className="text-[12.5px] font-medium text-muted-foreground">
              Across {countOf(byCourse.length, "course")} and {countOf(grades.length, "marked assignment")}.
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <section aria-labelledby="grades-by-course" className="rounded-[14px] border-2 border-border bg-card p-5 shadow-md">
              <h2 id="grades-by-course" className={SECTION_HEADING}>
                By course
              </h2>
              <ul className="divide-dash">
                {byCourse.map((c) => (
                  <li key={c.courseId} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words text-[13.5px] font-bold">{c.title}</span>
                      <span className="num shrink-0 text-[13.5px] font-bold">{c.average}%</span>
                    </div>
                    <ProgressBar
                      value={c.average}
                      color={courseAccent(c.courseId)}
                      size="sm"
                      className="mt-1.5"
                      label={`Average in ${c.title}`}
                    />
                  </li>
                ))}
              </ul>
            </section>

            {top ? (
              <div
                className="flex items-center gap-3 rounded-[14px] border-2 border-border bg-card p-4"
                style={{ boxShadow: "5px 5px 0 var(--warning)" }}
              >
                <span
                  aria-hidden
                  className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border-2 border-foreground bg-warning text-warning-foreground"
                >
                  <Icon name="award" className="size-5" />
                </span>
                <div className="min-w-0">
                  <b className="block break-words text-[13.5px] font-bold">
                    Your strongest course: {top.title}
                  </b>
                  <span className="num text-[12.5px] font-medium text-muted-foreground">
                    {top.average}% average across {countOf(top.count, "assignment")}
                  </span>
                </div>
              </div>
            ) : null}

            <section aria-labelledby="grades-recent" className="rounded-[14px] border-2 border-border bg-card p-5 shadow-md">
              <h2 id="grades-recent" className={SECTION_HEADING}>
                {grades.length > RECENT_LIMIT ? `Latest ${RECENT_LIMIT} marks` : "Every mark"}
              </h2>
              <ul className="divide-dash">
                {recent.map((g) => (
                  <li key={g.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-[13.5px] font-bold">
                          {g.submission.assignment.title}
                        </h3>
                        <p className="text-[12px] font-medium text-muted-foreground">
                          {courseMap.get(g.courseId) ?? "Course"} · marked {formatDate(g.gradedAt, format)}
                        </p>
                      </div>
                      <span className="num shrink-0 rounded-[8px] border-2 border-border bg-background px-2 py-1 text-[13px] font-bold">
                        {g.points}/{g.maxPoints}
                      </span>
                    </div>
                    {g.feedback ? (
                      <p className="mt-2 whitespace-pre-line break-words rounded-[10px] border-2 border-dashed border-border bg-background px-3 py-2 text-[13px] font-medium leading-relaxed text-foreground">
                        <span className="font-bold">Feedback: </span>
                        {g.feedback}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
