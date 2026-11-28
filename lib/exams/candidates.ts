import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { DomainError } from "@/lib/api/errors";

/**
 * Creating exam candidates and their sign-in credentials.
 *
 * Every candidate — learner or external — gets an Exam ID (`candidateNo`,
 * unique per academy) and a 6-digit PIN. Only the PIN's argon2 hash is kept:
 * the plain PIN is returned ONCE, from the call that made it, for printing on
 * a slip or emailing. Lost PINs are reset, never recovered.
 *
 * Used by the admin routes, CSV import and the public API alike.
 */

export type NewCandidate = {
  clientId?: string | null;
  fullName: string;
  email?: string | null;
  regNumber?: string | null;
  sittingId?: string | null;
  extraTimePct?: number;
};

export type IssuedCandidate = {
  id: string;
  candidateNo: string;
  fullName: string;
  email: string | null;
  regNumber: string | null;
  pin: string;
  created: boolean;
};

export function newPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function prefixFor(code: string | null): string {
  const clean = (code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return clean || "EX";
}

async function uniqueCandidateNo(tenantId: string, prefix: string): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const no = `${prefix}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    const taken = await prisma.examCandidate.findFirst({ where: { tenantId, candidateNo: no }, select: { id: true } });
    if (!taken) return no;
  }
  throw new DomainError(500, "candidate_no", "Could not allocate an Exam ID. Try again.");
}

/**
 * Add candidates to an exam. A learner already on the list is returned with a
 * fresh PIN only when `resetExistingPins` is set (otherwise their PIN is "").
 */
export async function addCandidates(
  examId: string,
  inputs: NewCandidate[],
  opts: { resetExistingPins?: boolean } = {}
): Promise<IssuedCandidate[]> {
  const exam = await prisma.exam.findFirst({ where: { id: examId }, select: { id: true, tenantId: true, code: true } });
  if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
  if (inputs.length > 5000) throw new DomainError(400, "too_many", "Add at most 5000 candidates at a time.");

  const sittingIds = [...new Set(inputs.map((i) => i.sittingId).filter((s): s is string => !!s))];
  if (sittingIds.length) {
    const found = await prisma.examSitting.count({ where: { id: { in: sittingIds }, examId } });
    if (found !== sittingIds.length) throw new DomainError(400, "invalid_sitting", "A sitting does not belong to this exam.");
  }
  const clientIds = [...new Set(inputs.map((i) => i.clientId).filter((c): c is string => !!c))];
  if (clientIds.length) {
    const found = await prisma.client.count({ where: { id: { in: clientIds } } });
    if (found !== clientIds.length) throw new DomainError(400, "invalid_learner", "A learner does not belong to this academy.");
  }
  const existing = clientIds.length
    ? await prisma.examCandidate.findMany({ where: { examId, clientId: { in: clientIds } } })
    : [];
  const byClient = new Map(existing.map((c) => [c.clientId!, c]));
  const prefix = prefixFor(exam.code);

  const out: IssuedCandidate[] = [];
  for (const input of inputs) {
    const already = input.clientId ? byClient.get(input.clientId) : undefined;
    if (already) {
      let pin = "";
      if (opts.resetExistingPins) {
        pin = newPin();
        await prisma.examCandidate.update({ where: { id: already.id }, data: { pinHash: await hashPassword(pin), pinFailedAttempts: 0, pinLockedUntil: null } });
      }
      out.push({ id: already.id, candidateNo: already.candidateNo, fullName: already.fullName, email: already.email, regNumber: already.regNumber, pin, created: false });
      continue;
    }
    const pin = newPin();
    const candidateNo = await uniqueCandidateNo(exam.tenantId, prefix);
    const row = await prisma.examCandidate.create({
      data: {
        tenantId: exam.tenantId,
        examId,
        clientId: input.clientId ?? null,
        fullName: input.fullName.trim().slice(0, 200) || "Candidate",
        email: input.email?.trim().toLowerCase() || null,
        regNumber: input.regNumber?.trim().slice(0, 60) || null,
        sittingId: input.sittingId ?? null,
        extraTimePct: Math.max(0, Math.min(300, input.extraTimePct ?? 0)),
        candidateNo,
        pinHash: await hashPassword(pin),
      },
    });
    if (input.clientId) byClient.set(input.clientId, row);
    out.push({ id: row.id, candidateNo, fullName: row.fullName, email: row.email, regNumber: row.regNumber, pin, created: true });
  }
  return out;
}

/** Issue new PINs (for slips). Returns the plain PINs once. */
export async function resetPins(examId: string, candidateIds?: string[]): Promise<IssuedCandidate[]> {
  const rows = await prisma.examCandidate.findMany({
    where: { examId, ...(candidateIds ? { id: { in: candidateIds } } : {}) },
    orderBy: { fullName: "asc" },
  });
  const out: IssuedCandidate[] = [];
  for (const c of rows) {
    const pin = newPin();
    await prisma.examCandidate.update({ where: { id: c.id }, data: { pinHash: await hashPassword(pin), pinFailedAttempts: 0, pinLockedUntil: null } });
    out.push({ id: c.id, candidateNo: c.candidateNo, fullName: c.fullName, email: c.email, regNumber: c.regNumber, pin, created: false });
  }
  return out;
}

/** Learners enrolled on a course, as candidate inputs. */
export async function enrolleesOf(courseId: string): Promise<NewCandidate[]> {
  const rows = await prisma.enrollment.findMany({
    where: { courseId },
    select: { client: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  return rows.map((r) => ({
    clientId: r.client.id,
    fullName: `${r.client.firstName ?? ""} ${r.client.lastName ?? ""}`.trim() || r.client.email,
    email: r.client.email,
  }));
}

/** Members of a learner group, as candidate inputs. */
export async function groupMembersOf(clientGroupId: string): Promise<NewCandidate[]> {
  const rows = await prisma.clientGroupMembership.findMany({
    where: { groupId: clientGroupId },
    select: { client: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  return rows.map((r) => ({
    clientId: r.client.id,
    fullName: `${r.client.firstName ?? ""} ${r.client.lastName ?? ""}`.trim() || r.client.email,
    email: r.client.email,
  }));
}
