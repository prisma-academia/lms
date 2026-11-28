import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { parseCsvRows } from "@/lib/assessments/import-formats";
import type { NewCandidate } from "@/lib/exams/candidates";

/**
 * Staff-side candidate list management: the request shapes, CSV import and
 * de-duplication of external candidates. The credential side (Exam IDs and
 * PINs) stays in lib/exams/candidates.ts.
 */

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const externalCandidateSchema = z.object({
  fullName: z.string().trim().min(1, "Every candidate needs a name.").max(200),
  email: z.preprocess(blankToNull, z.email("Not a valid email address.").nullable()).optional(),
  regNumber: z.preprocess(blankToNull, z.string().trim().max(60).nullable()).optional(),
  sittingId: z.preprocess(blankToNull, z.string().min(1).nullable()).optional(),
  extraTimePct: z.number().int().min(0).max(300).optional(),
});

export const addCandidatesSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("learners"),
    clientIds: z.array(z.string().min(1)).min(1).max(5000),
    sittingId: z.string().min(1).nullable().optional(),
  }),
  z.object({
    mode: z.literal("group"),
    clientGroupId: z.string().min(1),
    sittingId: z.string().min(1).nullable().optional(),
  }),
  z.object({
    mode: z.literal("course"),
    courseId: z.string().min(1).nullable().optional(),
    sittingId: z.string().min(1).nullable().optional(),
  }),
  z.object({
    mode: z.literal("external"),
    candidates: z.array(externalCandidateSchema).min(1).max(5000),
  }),
]);

export const candidatePatchSchema = z.object({
  fullName: z.string().trim().min(1, "The candidate needs a name.").max(200).optional(),
  email: z.preprocess(blankToNull, z.email("Not a valid email address.").nullable()).optional(),
  regNumber: z.preprocess(blankToNull, z.string().trim().max(60).nullable()).optional(),
  sittingId: z.preprocess(blankToNull, z.string().min(1).nullable()).optional(),
  extraTimePct: z.number().int().min(0).max(300).optional(),
  status: z.enum(["ACTIVE", "BLOCKED", "WITHDRAWN"]).optional(),
});

const fullNameOf = (c: { firstName: string | null; lastName: string | null; email: string }) =>
  `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email;

/**
 * Split external candidates into ones to add and ones already on the list
 * (same email or registration number). A person whose email belongs to a
 * learner account is linked to it, so they can also sit from their dashboard
 * and are never listed twice.
 */
export async function prepareExternal(
  tenantId: string,
  examId: string,
  inputs: z.infer<typeof externalCandidateSchema>[]
): Promise<{ add: NewCandidate[]; skipped: { fullName: string; reason: string }[] }> {
  const existing = await prisma.examCandidate.findMany({ where: { examId }, select: { email: true, regNumber: true } });
  const emails = new Set(existing.map((c) => c.email?.toLowerCase()).filter(Boolean) as string[]);
  const regs = new Set(existing.map((c) => c.regNumber?.toLowerCase()).filter(Boolean) as string[]);
  const wanted = [...new Set(inputs.map((i) => i.email?.toLowerCase()).filter(Boolean) as string[])];
  const learners = wanted.length
    ? await prisma.client.findMany({ where: { tenantId, email: { in: wanted } }, select: { id: true, email: true } })
    : [];
  const learnerBy = new Map(learners.map((l) => [l.email.toLowerCase(), l.id]));

  const add: NewCandidate[] = [];
  const skipped: { fullName: string; reason: string }[] = [];
  for (const i of inputs) {
    const email = i.email?.toLowerCase() ?? null;
    const reg = i.regNumber?.toLowerCase() ?? null;
    if (email && emails.has(email)) {
      skipped.push({ fullName: i.fullName, reason: `${i.email} is already on the list.` });
      continue;
    }
    if (reg && regs.has(reg)) {
      skipped.push({ fullName: i.fullName, reason: `Registration number ${i.regNumber} is already on the list.` });
      continue;
    }
    if (email) emails.add(email);
    if (reg) regs.add(reg);
    add.push({
      clientId: email ? learnerBy.get(email) ?? null : null,
      fullName: i.fullName,
      email,
      regNumber: i.regNumber ?? null,
      sittingId: i.sittingId ?? null,
      extraTimePct: i.extraTimePct ?? 0,
    });
  }
  return { add, skipped };
}

export async function learnersAsCandidates(tenantId: string, clientIds: string[]): Promise<NewCandidate[]> {
  const ids = [...new Set(clientIds)];
  const rows = await prisma.client.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return rows.map((c) => ({ clientId: c.id, fullName: fullNameOf(c), email: c.email }));
}

/* ───────────────────────────── CSV import ───────────────────────────── */

export type CsvCandidateRow = {
  line: number;
  fullName: string;
  email: string | null;
  regNumber: string | null;
  sitting: string | null;
  sittingId: string | null;
  extraTimePct: number;
  /** Matches an existing learner account by email. */
  learner: boolean;
  issue: string | null;
};

const HEADER_ALIASES: Record<string, keyof Omit<CsvCandidateRow, "line" | "sittingId" | "learner" | "issue">> = {
  fullname: "fullName",
  name: "fullName",
  "full name": "fullName",
  candidate: "fullName",
  email: "email",
  "email address": "email",
  regnumber: "regNumber",
  reg: "regNumber",
  "reg no": "regNumber",
  "reg number": "regNumber",
  "registration number": "regNumber",
  matric: "regNumber",
  sitting: "sitting",
  session: "sitting",
  batch: "sitting",
  extratimepct: "extraTimePct",
  "extra time": "extraTimePct",
  "extra time %": "extraTimePct",
  extratime: "extraTimePct",
};

const DEFAULT_ORDER = ["fullName", "email", "regNumber", "sitting", "extraTimePct"] as const;

export async function parseCandidateCsv(
  tenantId: string,
  examId: string,
  csv: string
): Promise<{ rows: CsvCandidateRow[]; headerFound: boolean }> {
  const table = parseCsvRows(csv);
  if (!table.length) return { rows: [], headerFound: false };
  const first = table[0].map((h) => h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "));
  const mapped = first.map((h) => HEADER_ALIASES[h] ?? HEADER_ALIASES[h.replace(/\s/g, "")]);
  const headerFound = mapped.includes("fullName");
  const columns = headerFound ? mapped : [...DEFAULT_ORDER];
  const body = headerFound ? table.slice(1) : table;

  const [sittings, existing] = await Promise.all([
    prisma.examSitting.findMany({ where: { examId }, select: { id: true, name: true } }),
    prisma.examCandidate.findMany({ where: { examId }, select: { email: true, regNumber: true } }),
  ]);
  const sittingBy = new Map(sittings.map((s) => [s.name.trim().toLowerCase(), s.id]));
  const emails = new Set(existing.map((c) => c.email?.toLowerCase()).filter(Boolean) as string[]);
  const regs = new Set(existing.map((c) => c.regNumber?.toLowerCase()).filter(Boolean) as string[]);

  const rows: CsvCandidateRow[] = body.slice(0, 5000).map((cells, i) => {
    const get = (key: (typeof DEFAULT_ORDER)[number]) => {
      const idx = columns.indexOf(key);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };
    const fullName = get("fullName");
    const email = get("email").toLowerCase() || null;
    const regNumber = get("regNumber") || null;
    const sitting = get("sitting") || null;
    const extraRaw = get("extraTimePct").replace(/%$/, "").trim();
    const extra = extraRaw ? Number(extraRaw) : 0;
    let issue: string | null = null;
    let sittingId: string | null = null;
    if (!fullName) issue = "No name.";
    else if (fullName.length > 200) issue = "Name is too long.";
    else if (email && !z.email().safeParse(email).success) issue = `"${email}" is not a valid email address.`;
    else if (!Number.isInteger(extra) || extra < 0 || extra > 300) issue = "Extra time must be a whole number from 0 to 300.";
    else if (sitting) {
      sittingId = sittingBy.get(sitting.toLowerCase()) ?? null;
      if (!sittingId) issue = `No sitting called "${sitting}". Create it on the Sittings tab first.`;
    }
    if (!issue && email && emails.has(email)) issue = `${email} is already on the list.`;
    if (!issue && regNumber && regs.has(regNumber.toLowerCase())) issue = `Registration number ${regNumber} is already on the list.`;
    if (!issue) {
      if (email) emails.add(email);
      if (regNumber) regs.add(regNumber.toLowerCase());
    }
    return {
      line: i + (headerFound ? 2 : 1),
      fullName,
      email,
      regNumber,
      sitting,
      sittingId,
      extraTimePct: Number.isFinite(extra) ? extra : 0,
      learner: false,
      issue,
    };
  });

  const wanted = [...new Set(rows.map((r) => r.email).filter(Boolean) as string[])];
  if (wanted.length) {
    const learners = await prisma.client.findMany({ where: { tenantId, email: { in: wanted } }, select: { email: true } });
    const known = new Set(learners.map((l) => l.email.toLowerCase()));
    for (const r of rows) r.learner = !!r.email && known.has(r.email);
  }
  return { rows, headerFound };
}
