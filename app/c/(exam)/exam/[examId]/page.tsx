import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { examPageGate } from "@/lib/exams/page-gate";
import { ExamLobby } from "@/components/exam/exam-lobby";
import { SebGate } from "@/components/exam/seb-gate";

export const metadata: Metadata = { title: "Exam lobby", robots: { index: false } };

export default async function ExamLobbyPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireExistingTenant();
  const { examId } = await params;
  const gate = await examPageGate(examId, `/exam/${examId}`, await searchParams);
  if (!gate.identity) redirect(`/exam?for=${encodeURIComponent(examId)}`);
  if (!gate.exam) notFound();
  if (gate.seb?.required && !gate.seb.ok) {
    return <SebGate examId={examId} title={gate.exam.title} reason={gate.seb.reason} inSeb={gate.seb.inSeb} />;
  }
  return <ExamLobby examId={examId} inSeb={!!gate.seb?.inSeb} />;
}
