import type { Metadata } from "next";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { getSession, readSessionToken } from "@/lib/auth/session";
import { ExamLogin } from "@/components/exam/exam-login";

export const metadata: Metadata = { title: "Exam sign-in", robots: { index: false } };

/** Public: candidates sign in with the Exam ID and PIN printed on their slip. */
export default async function ExamSignInPage() {
  const page = await requireExistingTenant();
  const session = await getSession(await readSessionToken("CLIENT"));
  const hasAccount = !!session && session.tenantId === page.tenant!.id;
  return <ExamLogin academy={page.tenant!.name} hasAccount={hasAccount} />;
}
