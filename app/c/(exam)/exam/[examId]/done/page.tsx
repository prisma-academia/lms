import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { resolveCandidateIdentity } from "@/lib/exams/candidate-auth";
import { ExamDone } from "@/components/exam/exam-done";

export const metadata: Metadata = { title: "Exam submitted", robots: { index: false } };

export default async function ExamDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ attempt?: string; quit?: string }>;
}) {
  await requireExistingTenant();
  const { examId } = await params;
  const sp = await searchParams;
  // SEB's quit URL must answer even after the session is gone.
  if (sp.quit === "1") return <ExamDone examId={examId} attemptId={null} quit pinSession={false} />;
  const identity = await resolveCandidateIdentity();
  if (!identity) redirect("/exam");
  return <ExamDone examId={examId} attemptId={sp.attempt ?? null} quit={false} pinSession={!!identity.pin && !identity.clientId} />;
}
