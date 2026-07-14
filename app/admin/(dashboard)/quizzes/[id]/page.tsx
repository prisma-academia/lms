import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { accessibleBankWhere } from "@/lib/assessments/bank-access";
import { PageHeader } from "@/components/shell";
import { QuizBuilder, type Candidate, type SelectedQ } from "./quiz-builder";

export default async function QuizDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_QUIZZES_READ.key);
  const { id } = await params;
  const quiz = await prisma.quiz.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: {
      questions: {
        orderBy: { sortOrder: "asc" },
        include: { question: { select: { id: true, prompt: true, type: true, points: true } } },
      },
    },
  });
  if (!quiz) notFound();

  const access = await accessibleBankWhere(actor);
  const banks = await prisma.questionBank.findMany({
    where: { AND: [{ tenantId: actor.tenantId }, access] },
    select: {
      id: true,
      name: true,
      questions: { select: { id: true, prompt: true, type: true, points: true } },
    },
  });
  const candidates: Candidate[] = banks.flatMap((b) =>
    b.questions.map((q) => ({ id: q.id, prompt: q.prompt, type: q.type, bank: b.name, defaultPoints: q.points }))
  );

  const selected: SelectedQ[] = quiz.questions.map((qq) => ({
    questionId: qq.question.id,
    prompt: qq.question.prompt,
    type: qq.question.type,
    points: qq.points ?? qq.question.points,
  }));

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
        }}
        selectedQuestions={selected}
        candidates={candidates}
        canWrite={hasPermission(actor, PERMISSIONS.TENANT_QUIZZES_WRITE.key)}
      />
    </div>
  );
}
