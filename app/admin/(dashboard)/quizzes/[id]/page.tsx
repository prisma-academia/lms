import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { accessibleBankWhere } from "@/lib/assessments/bank-access";
import { PageHeader } from "@/components/shell";
import type { QuestionResult } from "@/lib/assessments/scoring";
import { attemptPasses, effectivePassMark } from "@/lib/assessments/pass-mark";
import { formatDateTime } from "@/lib/format";
import { loadQuizSources } from "@/lib/assessments/quiz-sources";
import { QuizBuilder, type Candidate, type SelectedQ } from "./quiz-builder";
import { AttemptsPanel, type AttemptRow } from "./attempts-panel";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function QuizDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_QUIZZES_READ.key);
  const { id } = await params;
  const quiz = await prisma.quiz.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: {
      questions: {
        orderBy: { sortOrder: "asc" },
        include: {
          question: {
            select: {
              id: true,
              prompt: true,
              type: true,
              points: true,
              hint: true,
              sourceLessonId: true,
              sourceAnchor: true,
            },
          },
        },
      },
    },
  });
  if (!quiz) notFound();

  const sourceOf = (q: { sourceLessonId: string | null; sourceAnchor: string | null }) =>
    q.sourceLessonId ? { lessonId: q.sourceLessonId, anchor: q.sourceAnchor } : null;

  const access = await accessibleBankWhere(actor);
  const banks = await prisma.questionBank.findMany({
    where: { AND: [{ tenantId: actor.tenantId }, access] },
    select: {
      id: true,
      name: true,
      questions: {
        select: {
          id: true,
          prompt: true,
          type: true,
          points: true,
          hint: true,
          sourceLessonId: true,
          sourceAnchor: true,
        },
      },
    },
  });
  const candidates: Candidate[] = banks.flatMap((b) =>
    b.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      bank: b.name,
      defaultPoints: q.points,
      hasHint: Boolean(q.hint?.trim()),
      source: sourceOf(q),
    }))
  );

  const selected: SelectedQ[] = quiz.questions.map((qq) => ({
    questionId: qq.question.id,
    prompt: qq.question.prompt,
    type: qq.question.type,
    points: qq.points ?? qq.question.points,
    hasHint: Boolean(qq.question.hint?.trim()),
    source: sourceOf(qq.question),
  }));

  // The lessons this quiz's questions can point learners back to.
  const sourceCourses = await loadQuizSources(actor.tenantId, quiz.id);

  const attemptRows = await prisma.quizAttempt.findMany({
    where: { quizId: id, tenantId: actor.tenantId, submittedAt: { not: null } },
    orderBy: { submittedAt: "desc" },
    take: 50,
    select: {
      id: true,
      submittedAt: true,
      scorePercent: true,
      passed: true,
      passMarkApplied: true,
      gradedByUserId: true,
      gradingStatus: true,
      gradingError: true,
      answersJson: true,
      resultsJson: true,
      client: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  const passMark = effectivePassMark(quiz.passingScore);

  // Dates are formatted here, once, in the academy's own locale and time zone.
  // The attempts panel is a Client Component: formatting there would run on the
  // server and again in the browser, in two different locales.
  const formatContext = await tenantFormatContext(actor.tenantId);

  const promptById = new Map(quiz.questions.map((qq) => [qq.question.id, qq.question] as const));
  const attempts: AttemptRow[] = attemptRows.map((a) => {
    const answers = (a.answersJson ?? {}) as Record<string, unknown>;
    const results = (a.resultsJson ?? {}) as Record<string, QuestionResult>;
    return {
      id: a.id,
      learner:
        [a.client?.firstName, a.client?.lastName].filter(Boolean).join(" ") ||
        a.client?.email ||
        "Unknown learner",
      submittedLabel: formatDateTime(a.submittedAt, formatContext),
      scorePercent: a.scorePercent,
      // The same rule the lesson gate applies (see `passingAttemptWhere`).
      passed:
        a.gradingStatus === "GRADED" &&
        (attemptPasses(a.scorePercent, passMark) || (a.passed === true && a.passMarkApplied != null)),
      markedByStaff: a.gradedByUserId != null,
      gradingStatus: a.gradingStatus,
      gradingError: a.gradingError,
      questions: Object.entries(results).map(([questionId, r]) => {
        const q = promptById.get(questionId);
        const raw = answers[questionId];
        return {
          questionId,
          prompt: q?.prompt ?? "(question removed)",
          type: q?.type ?? "UNKNOWN",
          answer: typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join(", ") : "",
          earned: r.earned ?? 0,
          points: r.points ?? 0,
          correct: r.correct ?? false,
          feedback: r.feedback ?? null,
          criteria: r.criteria ?? [],
        };
      }),
    };
  });

  return (
    <div>
      <PageHeader title={quiz.title} subtitle="Assemble questions and settings." backHref="/admin/quizzes" backLabel="Quizzes" />
      <QuizBuilder
        id={quiz.id}
        initial={{
          title: quiz.title,
          description: quiz.description ?? "",
          passingScore: quiz.passingScore != null ? String(quiz.passingScore) : "",
          timeLimitMin: quiz.timeLimitMin != null ? String(quiz.timeLimitMin) : "",
          hintsEnabled: quiz.hintsEnabled,
          showReviewLinks: quiz.showReviewLinks,
        }}
        selectedQuestions={selected}
        candidates={candidates}
        sourceCourses={sourceCourses}
        canWrite={hasPermission(actor, PERMISSIONS.TENANT_QUIZZES_WRITE.key)}
      />
      <div className="mt-6">
        <AttemptsPanel
          quizId={quiz.id}
          attempts={attempts}
          passMark={passMark}
          canGrade={hasPermission(actor, PERMISSIONS.TENANT_GRADES_WRITE.key)}
        />
      </div>
    </div>
  );
}
