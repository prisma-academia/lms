import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { canAccessBank } from "@/lib/assessments/bank-access";
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
        include: { tags: { select: { tagId: true } } },
      },
      accessGroups: { select: { userGroupId: true } },
    },
  });
  if (!bank) notFound();

  const [tags, groups] = await Promise.all([
    prisma.questionTag.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" } }),
    prisma.userGroup.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const questions: BankQuestion[] = bank.questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: (q.optionsJson as string[]) ?? [],
    answer: (q.answerJson as (number | string)[]) ?? [],
    points: q.points,
    tagIds: q.tags.map((t) => t.tagId),
  }));

  return (
    <div>
      <PageHeader title={bank.name} subtitle="Manage questions, tags, and sharing." />
      <BankEditor
        id={bank.id}
        initial={{ name: bank.name, description: bank.description ?? "" }}
        questions={questions}
        tags={tags.map((t) => ({ id: t.id, name: t.name }))}
        groups={groups}
        accessGroupIds={bank.accessGroups.map((a) => a.userGroupId)}
        canWrite={hasPermission(actor, PERMISSIONS.TENANT_QUIZZES_WRITE.key)}
      />
    </div>
  );
}
