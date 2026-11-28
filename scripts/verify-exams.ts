/**
 * The CBT engine, end to end against the database, plus the pure pieces
 * (clock, IP ranges, Safe Exam Browser hashes).
 *
 * Builds a throwaway exam inside a real tenant — a bank with several question
 * types, a fixed section and a random pool, an external candidate — then
 * starts an attempt, syncs answers (including stale and replayed revisions),
 * trips the strike policy, has an invigilator unlock / extend / pause /
 * resume, submits, grades, applies negative marking, and releases. Everything
 * created is deleted in `finally`. No AI calls (no essays).
 *
 *   npx tsx scripts/verify-exams.ts [--tenant <slug>]
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { prisma } from "../lib/db/client";
import { runWithContext } from "../lib/db/tenant-context";
import { computeDeadline, remainingMs, acceptsSave, windowState, resumedDeadline } from "../lib/exams/timing";
import { ipAllowed, ipInCidr, isValidCidr } from "../lib/exams/ip";
import { verifySeb, sebConfigFile } from "../lib/exams/seb";
import { parseSecurity } from "../lib/exams/settings";
import { addCandidates, resetPins } from "../lib/exams/candidates";
import { startOrResume, applySync, finalizeAttempt } from "../lib/exams/attempts";
import { applyProctorAction } from "../lib/exams/proctor";
import { gradeExamAttempt } from "../lib/exams/grading";
import { releaseResults } from "../lib/exams/outcomes";
import { candidatePackage, parsePaper } from "../lib/exams/paper";
import { verifyPassword } from "../lib/auth/password";

const args = process.argv.slice(2);
const wantTenantSlug = args.includes("--tenant") ? args[args.indexOf("--tenant") + 1] : null;
let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail !== undefined ? `\n      ${JSON.stringify(detail)}` : ""}`);
}

async function pure() {
  const start = new Date("2026-12-01T09:00:00Z");
  const exam = { durationMin: 60, closesAt: new Date("2026-12-01T09:45:00Z"), offlineGraceMin: 3 };
  check("deadline capped at the window close", computeDeadline(exam, { extraTimePct: 0 }, null, start).toISOString() === "2026-12-01T09:45:00.000Z");
  check(
    "extra time stretches past the cap by the same amount",
    computeDeadline(exam, { extraTimePct: 25 }, null, start).toISOString() === "2026-12-01T10:00:00.000Z"
  );
  check("no cap: full duration", computeDeadline({ ...exam, closesAt: null }, { extraTimePct: 0 }, null, start).toISOString() === "2026-12-01T10:00:00.000Z");
  const a = { status: "IN_PROGRESS", deadlineAt: new Date(start.getTime() + 60_000), pausedAt: null };
  check("remaining", remainingMs(a, start) === 60_000);
  check("paused clock is frozen", remainingMs({ ...a, pausedAt: new Date(start.getTime() + 10_000) }, new Date(start.getTime() + 50_000)) === 50_000);
  check("resume gives the pause back", resumedDeadline({ deadlineAt: a.deadlineAt, pausedAt: start }, new Date(start.getTime() + 30_000)).getTime() === a.deadlineAt.getTime() + 30_000);
  const after = new Date(a.deadlineAt.getTime() + 60_000);
  check("late save refused when online", !acceptsSave(a, exam, after, { wasOffline: false }).ok);
  check("late save accepted inside offline grace", acceptsSave(a, exam, after, { wasOffline: true }).ok);
  check("late save refused after grace", !acceptsSave(a, exam, new Date(a.deadlineAt.getTime() + 4 * 60_000), { wasOffline: true }).ok);
  check("in-flight slack", acceptsSave(a, exam, new Date(a.deadlineAt.getTime() + 5_000), { wasOffline: false }).ok);
  const w = { status: "PUBLISHED", opensAt: start, closesAt: exam.closesAt, lateEntryMin: 15 };
  check("upcoming", windowState(w, null, new Date(start.getTime() - 1)) === "upcoming");
  check("open", windowState(w, null, new Date(start.getTime() + 60_000)) === "open");
  check("entry closed", windowState(w, null, new Date(start.getTime() + 16 * 60_000)) === "entry_closed");
  check("closed", windowState(w, null, exam.closesAt) === "closed");

  check("cidr v4", ipInCidr("41.58.10.20", "41.58.0.0/16") && !ipInCidr("41.59.0.1", "41.58.0.0/16"));
  check("single ip", ipInCidr("102.89.1.7", "102.89.1.7"));
  check("v6", ipInCidr("2001:db8::1", "2001:db8::/32") && !ipInCidr("2001:db9::1", "2001:db8::/32"));
  check("v4-mapped", ipInCidr("::ffff:10.0.0.5", "10.0.0.0/8"));
  check("allowlist empty = anywhere", ipAllowed(null, []));
  check("allowlist enforced", !ipAllowed("8.8.8.8", ["10.0.0.0/8"]));
  check("cidr validation", isValidCidr("10.0.0.0/8") && !isValidCidr("10.0.0.0/33") && !isValidCidr("banana"));

  const key = "a".repeat(64);
  const url = "https://demo.prismalms.com/exam/x";
  const sec = { ...parseSecurity({ lockdown: "SEB_REQUIRED" }), seb: { configKeys: [key], browserExamKeys: [], quitPassword: null } };
  const good = new Headers({ "x-safeexambrowser-configkeyhash": createHash("sha256").update(url + key).digest("hex") });
  check("SEB config key verified", verifySeb(good, url, sec).ok);
  check("SEB hash for another URL refused", !verifySeb(good, url + "/sit", sec).ok);
  check("SEB missing refused", verifySeb(new Headers(), url, sec).reason === "missing");
  check("SEB not required passes", verifySeb(new Headers(), url, parseSecurity({ lockdown: "STRICT" })).ok);
  const file = sebConfigFile({ origin: "https://demo.prismalms.com", examId: "x", examTitle: "T <&>", quitPassword: "pw" });
  check("SEB file is a plist with escaped title and hashed quit password", file.includes("<plist") && file.includes("T &lt;&amp;&gt;") && !file.includes(">pw<"));
}

async function main() {
  await pure();

  const tenant = wantTenantSlug
    ? await prisma.tenant.findFirst({ where: { slug: wantTenantSlug }, select: { id: true, slug: true } })
    : await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, slug: true } });
  if (!tenant) throw new Error("No tenant found to run against.");
  console.log(`\nTenant: ${tenant.slug} (${tenant.id})\n`);
  const t = tenant.id;

  await runWithContext({ mode: "tenant-admin", tenantId: t }, async () => {
    const stamp = Date.now();
    const bank = await prisma.questionBank.create({ data: { tenantId: t, name: `CBT verification ${stamp}` } });
    const exam = await prisma.exam.create({
      data: {
        tenantId: t,
        title: `CBT verification ${stamp}`,
        code: `VER${String(stamp).slice(-5)}`,
        status: "PUBLISHED",
        durationMin: 30,
        passMark: 50,
        negativeMarking: 0.25,
        shuffleQuestions: true,
        shuffleOptions: true,
        resultRelease: "MANUAL",
        securityJson: { lockdown: "STRICT", maxViolations: 2, onMaxViolations: "LOCK" },
        gradeBandsJson: [{ min: 70, label: "A", remark: "" }, { min: 50, label: "C", remark: "" }, { min: 0, label: "F", remark: "" }],
      },
    });
    try {
      const mk = (type: string, prompt: string, optionsJson: unknown, answerJson: unknown, points = 2) =>
        prisma.question.create({ data: { tenantId: t, bankId: bank.id, type: type as never, prompt, optionsJson: optionsJson as object, answerJson: answerJson as object, points } });
      const q1 = await mk("SINGLE_CHOICE", "2 + 2?", ["3", "4", "5"], [1]);
      const q2 = await mk("NUMERIC", "g?", { unit: "m/s²" }, { value: 9.81, tolerance: 0.05, mode: "abs" });
      const q3 = await mk("FILL_BLANKS", "Capital of [[1]] is [[2]].", { blanks: [{ id: "1", choices: null }, { id: "2", choices: null }] }, { "1": ["France"], "2": ["Paris"] });
      await Promise.all([0, 1, 2, 3].map((i) => mk("TRUE_FALSE", `Statement ${i}`, ["True", "False"], [i % 2], 1)));
      const sectionA = await prisma.examSection.create({ data: { tenantId: t, examId: exam.id, title: "A", sortOrder: 0 } });
      await prisma.examSectionItem.createMany({
        data: [q1, q2, q3].map((q, i) => ({ tenantId: t, sectionId: sectionA.id, questionId: q.id, sortOrder: i })),
      });
      await prisma.examSection.create({
        data: { tenantId: t, examId: exam.id, title: "B", sortOrder: 1, poolsJson: [{ id: "p1", bankId: bank.id, tagIds: [], difficulty: null, types: ["TRUE_FALSE"], count: 2, points: 1 }] },
      });

      const [issued] = await addCandidates(exam.id, [{ fullName: "Ada Candidate", regNumber: "R-1" }]);
      check("candidate gets an Exam ID and a 6-digit PIN", /^VER\d+-\d{6}$/.test(issued.candidateNo) && /^\d{6}$/.test(issued.pin), issued);
      const row = await prisma.examCandidate.findFirst({ where: { id: issued.id } });
      check("only the PIN hash is stored", !!row?.pinHash && row.pinHash !== issued.pin && (await verifyPassword(row.pinHash, issued.pin)));
      const [reissued] = await resetPins(exam.id, [issued.id]);
      const row2 = await prisma.examCandidate.findFirst({ where: { id: issued.id } });
      check("PIN reset invalidates the old PIN", !(await verifyPassword(row2!.pinHash!, issued.pin)) && (await verifyPassword(row2!.pinHash!, reissued.pin)));

      const started = await startOrResume({ examId: exam.id, candidateId: issued.id, deviceToken: "device-AAAA", ip: "10.1.1.1", userAgent: "verify", sebVerified: false });
      const paper = parsePaper(started.attempt.paperJson);
      check("paper has the fixed items and the drawn pool", paper.sections[0].items.length === 3 && paper.sections[1].items.length === 2, paper.sections.map((s) => s.items.length));
      check("pool points override applied", paper.sections[1].items.every((i) => i.points === 1));
      check("total points", paper.totalPoints === 8, paper.totalPoints);
      const pkg = await candidatePackage(paper, started.attempt.seed);
      check("package never contains an answer key", !JSON.stringify(pkg).includes('"answer') && !JSON.stringify(pkg).includes("Paris"));
      const again = await startOrResume({ examId: exam.id, candidateId: issued.id, deviceToken: "device-AAAA", ip: "10.1.1.1", userAgent: "verify", sebVerified: false });
      check("same device resumes the same attempt", again.attempt.id === started.attempt.id && again.resumed);
      let otherDevice = "";
      try {
        await startOrResume({ examId: exam.id, candidateId: issued.id, deviceToken: "device-BBBB", ip: "10.1.1.2", userAgent: "verify", sebVerified: false });
      } catch (e) {
        otherDevice = (e as { code?: string }).code ?? String(e);
      }
      check("a second device is refused", otherDevice === "other_device", otherDevice);

      const id = started.attempt.id;
      const [pA, pB] = paper.sections[1].items;
      const tfAnswer = async (qid: string) => ((await prisma.question.findFirst({ where: { id: qid } }))!.answerJson as number[])[0];
      const base = { deviceToken: "device-AAAA", events: [], wasOffline: false };
      let r = await applySync(id, {
        ...base,
        responses: [
          { key: q1.id, answer: [1], flagged: false, timeSpentSec: 5, rev: 2 },
          { key: q2.id, answer: "9.80", flagged: true, timeSpentSec: 5, rev: 1 },
          { key: q3.id, answer: { "1": "france", "2": "Lyon" }, flagged: false, timeSpentSec: 5, rev: 1 },
          { key: pA.key, answer: [await tfAnswer(pA.questionId)], flagged: false, timeSpentSec: 1, rev: 1 },
          { key: pB.key, answer: [1 - (await tfAnswer(pB.questionId))], flagged: false, timeSpentSec: 1, rev: 1 },
          { key: "not-on-paper", answer: [0], flagged: false, timeSpentSec: 0, rev: 1 },
        ],
      });
      check("answers accepted (off-paper keys ignored)", Object.keys(r.accepted).length === 5, r.accepted);
      r = await applySync(id, { ...base, responses: [{ key: q1.id, answer: [0], flagged: false, timeSpentSec: 9, rev: 1 }] });
      const kept = await prisma.examResponse.findFirst({ where: { attemptId: id, itemKey: q1.id } });
      check("a stale revision never overwrites a newer one", JSON.stringify(kept?.answerJson) === "[1]" && kept?.rev === 2);

      // Strike policy: 2 violations → LOCK; events replayed are not double-counted.
      const ev = [
        { id: "e1-" + stamp, type: "TAB_HIDDEN", at: new Date().toISOString() },
        { id: "e2-" + stamp, type: "COPY", at: new Date().toISOString() },
      ];
      r = await applySync(id, { ...base, responses: [], events: ev });
      check("strike limit locks the attempt", r.status === "LOCKED" && r.violationCount === 2, r);
      r = await applySync(id, { ...base, responses: [], events: ev });
      check("replayed events are not double-counted", r.violationCount === 2);
      r = await applySync(id, { ...base, responses: [{ key: q1.id, answer: [2], flagged: false, timeSpentSec: 1, rev: 3 }] });
      check("a locked attempt cannot change answers", r.rejected.includes(q1.id));
      await applyProctorAction(id, { kind: "unlock" }, "verify-staff");
      r = await applySync(id, { ...base, responses: [], events: [{ id: "e3-" + stamp, type: "TAB_HIDDEN", at: new Date().toISOString() }] });
      check("after unlock, old strikes no longer count", r.status === "IN_PROGRESS" && r.strikes === 1, r);

      const before = (await prisma.examAttempt.findFirst({ where: { id } }))!.deadlineAt.getTime();
      await applyProctorAction(id, { kind: "extend", minutes: 10 }, "verify-staff");
      const extended = (await prisma.examAttempt.findFirst({ where: { id } }))!.deadlineAt.getTime();
      check("extra time moves the deadline", extended - before === 600_000);
      await applyProctorAction(id, { kind: "pause" }, "verify-staff");
      r = await applySync(id, { ...base, responses: [{ key: q2.id, answer: "9.81", flagged: true, timeSpentSec: 1, rev: 2 }] });
      check("paused: clock frozen and answers refused", r.paused && r.rejected.includes(q2.id));
      await applyProctorAction(id, { kind: "resume" }, "verify-staff");
      const resumed = (await prisma.examAttempt.findFirst({ where: { id } }))!;
      check("resume gives back the paused time", resumed.status === "IN_PROGRESS" && resumed.deadlineAt.getTime() >= extended);

      r = await applySync(id, { ...base, responses: [], submit: { reason: "MANUAL" } });
      check("submit finishes the attempt", r.finished && r.status === "SUBMITTED", r);
      const g = await gradeExamAttempt(id);
      // q1 right 2 + q2 9.80 within ±0.05 → 2 + q3 one of two blanks, no partial → 0 and −0.5 negative
      // + pool one right (1) one wrong (−0.25) = 2 + 2 − 0.5 + 1 − 0.25 = 4.25 of 8 → 53.13%
      check("score with negative marking", g.scorePoints === 4.25 && g.maxPoints === 8, g);
      check("grade band and pass", g.grade === "C" && g.passed, g);
      check("double submit is a no-op", (await finalizeAttempt(id, "MANUAL")) === false);
      const released = await releaseResults(exam.id);
      const final = (await prisma.examAttempt.findFirst({ where: { id } }))!;
      check("manual release releases graded attempts", released === 1 && !!final.releasedAt);
      let late = "";
      try {
        await startOrResume({ examId: exam.id, candidateId: issued.id, deviceToken: "device-AAAA", ip: null, userAgent: null, sebVerified: false });
      } catch (e) {
        late = (e as { code?: string }).code ?? String(e);
      }
      check("attempts are limited", late === "no_attempts_left", late);
    } finally {
      await prisma.exam.delete({ where: { id: exam.id } });
      await prisma.questionBank.delete({ where: { id: bank.id } });
      console.log("\nCleaned up the verification exam and bank.");
    }
  });

  console.log(failed === 0 ? "\nAll exam checks passed." : `\n${failed} check(s) FAILED.`);
}

main()
  .catch((e) => {
    console.error("\nVerification crashed:", e);
    failed++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed === 0 ? 0 : 1);
  });
