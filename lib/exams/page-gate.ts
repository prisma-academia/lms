import { headers } from "next/headers";
import { prisma } from "@/lib/db/client";
import { resolveCandidateIdentity, type CandidateIdentity } from "@/lib/exams/candidate-auth";
import { parseSecurity } from "@/lib/exams/settings";
import { looksLikeSeb, verifySeb } from "@/lib/exams/seb";

/**
 * What the candidate-facing exam pages need before rendering: an identity,
 * the exam, and whether Safe Exam Browser is required and present.
 */
export async function examPageGate(examId: string, publicPath: string, search: Record<string, string | string[] | undefined> = {}) {
  const identity: CandidateIdentity | null = await resolveCandidateIdentity();
  if (!identity) return { identity: null, exam: null, seb: null } as const;
  const exam = await prisma.exam.findFirst({
    where: { id: examId, tenantId: identity.tenantId },
    select: { id: true, title: true, status: true, securityJson: true },
  });
  if (!exam) return { identity, exam: null, seb: null } as const;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (typeof v === "string") qs.append(k, v);
    else if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
  }
  const url = `${proto}://${host}${publicPath}${qs.size ? `?${qs.toString()}` : ""}`;
  const security = parseSecurity(exam.securityJson);
  const check = verifySeb(h, url, security);
  return {
    identity,
    exam,
    seb: { required: security.lockdown === "SEB_REQUIRED", ok: check.ok, reason: check.reason, inSeb: looksLikeSeb(h) },
  } as const;
}
