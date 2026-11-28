import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { canAccessBank } from "@/lib/assessments/bank-access";
import { toEditorQuestion } from "@/lib/assessments/question-io";
import { aiStatus } from "@/lib/ai/config";
import { PageHeader } from "@/components/shell";
import { BankEditor, type BankQuestion } from "./bank-editor";

export default async function BankDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_QUIZZES_READ.key);
  const { id } = await params;
  if (!(await canAccessBank(actor, id))) notFound();

  const bank = await prisma.questionBank.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: {
      questions: {
        orderBy: { createdAt: "desc" },
        include: {
          tags: { select: { tagId: true } },
          _count: { select: { quizLinks: true, examItems: true } },
        },
      },
      groups: { orderBy: { createdAt: "asc" }, include: { _count: { select: { questions: true } } } },
      accessGroups: { select: { userGroupId: true } },
    },
  });
  if (!bank) notFound();

  const [tags, groups] = await Promise.all([
    prisma.questionTag.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" } }),
    prisma.userGroup.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const questions: BankQuestion[] = bank.questions.map((q) => ({
    ...toEditorQuestion(q),
    usage: q._count.quizLinks + q._count.examItems,
  }));

  return (
    <div>
      <PageHeader
        title={bank.name}
        subtitle="Write, import or generate questions of every type, then use them in quizzes and CBT exams."
        backHref="/admin/question-banks"
        backLabel="Question banks"
      />
      <BankEditor
        id={bank.id}
        initial={{ name: bank.name, description: bank.description ?? "" }}
        questions={questions}
        tags={tags.map((t) => ({ id: t.id, name: t.name }))}
        groups={groups}
        passages={bank.groups.map((g) => ({ id: g.id, title: g.title, stimulus: g.stimulusHtml, questionCount: g._count.questions }))}
        accessGroupIds={bank.accessGroups.map((a) => a.userGroupId)}
        canWrite={hasPermission(actor, PERMISSIONS.TENANT_QUIZZES_WRITE.key)}
        aiEnabled={aiStatus().configured}
      />
    </div>
  );
}
