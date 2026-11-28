import type { z } from "zod";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { addCandidates, type NewCandidate } from "@/lib/exams/candidates";
import { CandidateInput } from "./schemas";

type In = z.infer<typeof CandidateInput>;

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const COLUMN: Record<string, keyof In> = {
  fullname: "fullName",
  name: "fullName",
  email: "email",
  regnumber: "regNumber",
  reg: "regNumber",
  learnerid: "learnerId",
  sittingid: "sittingId",
  extratimepct: "extraTimePct",
};

/** CSV → candidate inputs, validated row by row (errors name the line). */
export function candidatesFromCsv(text: string): In[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const cols = header.map((h) => COLUMN[h.trim().toLowerCase().replace(/[^a-z]/g, "")] ?? null);
  if (!cols.includes("fullName") && !cols.includes("learnerId")) {
    throw new DomainError(400, "invalid_csv", "The CSV header needs a fullName (or learnerId) column.");
  }
  if (rows.length > 5000) throw new DomainError(400, "too_many", "Import at most 5000 candidates at a time.");
  return rows.map((r, i) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, j) => {
      const v = (r[j] ?? "").trim();
      if (!c || v === "") return;
      obj[c] = c === "extraTimePct" ? Number(v) : v;
    });
    const parsed = CandidateInput.safeParse(obj);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new DomainError(400, "invalid_csv", `Line ${i + 2}: ${first?.path.join(".") || "row"}: ${first?.message ?? "invalid"}`);
    }
    return parsed.data;
  });
}

/**
 * API candidate inputs → `addCandidates`. Learner candidates take the
 * learner's own name and email when the row leaves them out.
 */
export async function addApiCandidates(tenantId: string, examId: string, inputs: In[], resetExistingPins: boolean) {
  const exam = await prisma.exam.findFirst({ where: { id: examId, tenantId }, select: { id: true } });
  if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
  const learnerIds = [...new Set(inputs.map((c) => c.learnerId).filter((x): x is string => !!x))];
  const learners = learnerIds.length
    ? await prisma.client.findMany({ where: { tenantId, id: { in: learnerIds } }, select: { id: true, email: true, firstName: true, lastName: true } })
    : [];
  if (learners.length !== learnerIds.length) throw new DomainError(400, "invalid_learner", "A learner does not belong to this academy.");
  const byId = new Map(learners.map((l) => [l.id, l]));
  const rows: NewCandidate[] = inputs.map((c, i) => {
    const l = c.learnerId ? byId.get(c.learnerId) : undefined;
    const fullName = c.fullName ?? (l ? `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || l.email : "");
    if (!fullName) throw new DomainError(400, "validation_error", `candidates.${i}.fullName: required for an external candidate.`);
    return {
      clientId: c.learnerId ?? null,
      fullName,
      email: c.email ?? l?.email ?? null,
      regNumber: c.regNumber ?? null,
      sittingId: c.sittingId ?? null,
      extraTimePct: c.extraTimePct,
    };
  });
  return addCandidates(exam.id, rows, { resetExistingPins });
}
