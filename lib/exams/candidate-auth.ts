import { cookies } from "next/headers";
import { rawPrisma } from "@/lib/db/raw-client";
import { prisma } from "@/lib/db/client";
import { enterContext } from "@/lib/db/tenant-context";
import { loadTenantPageContext } from "@/lib/db/page-context";
import { getSession, readSessionToken } from "@/lib/auth/session";
import { hashOpaqueToken, newOpaqueToken } from "@/lib/auth/tokens";
import { isProd } from "@/lib/env";
import { AuthError } from "@/lib/auth/guards";

/**
 * Who is sitting an exam.
 *
 * Two ways in, one identity:
 *  - a learner signed in with their account (the normal client session), or
 *  - anyone with an Exam ID + PIN, who gets an exam-only session scoped to ONE
 *    exam (`ExamSession`). It opens nothing else in the academy.
 *
 * The tenant always comes from the host, and every candidate found is checked
 * against it — a cookie from one academy never opens another's exam.
 */

export const EXAM_COOKIE = "__mt-exam-session";
const EXAM_SESSION_HOURS = 12;

export type CandidateIdentity = {
  tenantId: string;
  /** Set when signed in with a learner account. */
  clientId: string | null;
  /** Set when signed in with Exam ID + PIN: the one candidate and exam it opens. */
  pin: { candidateId: string; examId: string; sessionId: string } | null;
};

export async function createExamSession(input: {
  tenantId: string;
  candidateId: string;
  examId: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + EXAM_SESSION_HOURS * 3_600_000);
  await rawPrisma.examSession.create({
    data: {
      tenantId: input.tenantId,
      tokenHash: hashOpaqueToken(token),
      candidateId: input.candidateId,
      examId: input.examId,
      expiresAt,
      ip: input.ip,
      userAgent: input.userAgent?.slice(0, 400) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(EXAM_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires: expiresAt,
  });
}

export async function endExamSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(EXAM_COOKIE)?.value;
  if (token) {
    await rawPrisma.examSession.updateMany({ where: { tokenHash: hashOpaqueToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  jar.delete(EXAM_COOKIE);
}

/** The host's academy, or null when this is not a tenant host. */
async function hostTenantId(): Promise<string | null> {
  const page = await loadTenantPageContext();
  if (page.mode !== "tenant" || !page.tenant || page.tenant.status !== "ACTIVE") return null;
  return page.tenant.id;
}

/**
 * Resolve the candidate identity for this request, or null. Binds the tenant
 * context when one is found so later queries are scoped.
 */
export async function resolveCandidateIdentity(): Promise<CandidateIdentity | null> {
  const tenantId = await hostTenantId();
  if (!tenantId) return null;

  let pin: CandidateIdentity["pin"] = null;
  const jar = await cookies();
  const examToken = jar.get(EXAM_COOKIE)?.value;
  if (examToken) {
    const s = await rawPrisma.examSession.findUnique({ where: { tokenHash: hashOpaqueToken(examToken) } });
    if (s && !s.revokedAt && s.expiresAt > new Date() && s.tenantId === tenantId) {
      pin = { candidateId: s.candidateId, examId: s.examId, sessionId: s.id };
    }
  }

  let clientId: string | null = null;
  const token = await readSessionToken("CLIENT");
  const session = await getSession(token);
  if (session && session.userType === "CLIENT" && session.tenantId === tenantId && session.scope === "FULL") {
    clientId = session.userId;
  }

  if (!pin && !clientId) return null;
  enterContext({ mode: "tenant-client", tenantId });
  if (clientId) {
    const client = await prisma.client.findFirst({ where: { id: clientId }, select: { status: true } });
    if (!client || client.status !== "ACTIVE") clientId = null;
  }
  if (!pin && !clientId) return null;
  return { tenantId, clientId, pin };
}

export async function requireCandidateIdentity(): Promise<CandidateIdentity> {
  const id = await resolveCandidateIdentity();
  if (!id) throw new AuthError(401, "Sign in to sit this exam.");
  return id;
}

/** Whether this identity may act as `candidate`. */
export function ownsCandidate(
  identity: CandidateIdentity,
  candidate: { id: string; clientId: string | null; examId: string }
): boolean {
  if (identity.pin && identity.pin.candidateId === candidate.id && identity.pin.examId === candidate.examId) return true;
  if (identity.clientId && candidate.clientId === identity.clientId) return true;
  return false;
}

export function clientIpOf(request: Request): string | null {
  const xf = request.headers.get("x-forwarded-for");
  const ip = xf ? xf.split(",")[0].trim() : request.headers.get("x-real-ip");
  return ip || null;
}
