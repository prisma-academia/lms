import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { examPageGate } from "@/lib/exams/page-gate";
import { ExamWindow } from "@/components/exam/exam-window";
import { SebGate } from "@/components/exam/seb-gate";

export const metadata: Metadata = { title: "Exam in progress", robots: { index: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

/**
 * The exam window. The page itself is a thin shell — everything runs in the
 * client so the service worker can serve it with no network.
 */
export default async function ExamSitPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireExistingTenant();
  const { examId } = await params;
  const gate = await examPageGate(examId, `/exam/${examId}/sit`, await searchParams);
  if (!gate.identity) redirect(`/exam?for=${encodeURIComponent(examId)}`);
  if (!gate.exam) notFound();
  if (gate.seb?.required && !gate.seb.ok) {
    return <SebGate examId={examId} title={gate.exam.title} reason={gate.seb.reason} inSeb={gate.seb.inSeb} />;
  }
  return <ExamWindow examId={examId} />;
}
