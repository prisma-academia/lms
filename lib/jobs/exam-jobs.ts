import { rawPrisma } from "@/lib/db/raw-client";
import { runWithContext } from "@/lib/db/tenant-context";
import { finalizeAttempt } from "@/lib/exams/attempts";
import { releaseResults } from "@/lib/exams/outcomes";

/**
 * Scheduled CBT work, run by `scripts/jobs.ts` (cron every minute for
 * `exam-autosubmit`; every 15 minutes for the others is plenty).
 *
 * Candidates' windows submit on time themselves; this is the backstop for a
 * window that was closed, crashed or never came back online. It waits out the
 * exam's offline grace so answers saved offline still have time to arrive.
 */

function inTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return runWithContext({ mode: "tenant-client", tenantId }, fn) as Promise<T>;
}

export async function autosubmitExpired(now = new Date()): Promise<{ submitted: number; closed: number }> {
  const due = await rawPrisma.examAttempt.findMany({
    where: { status: { in: ["IN_PROGRESS", "LOCKED"] }, pausedAt: null, deadlineAt: { lt: now } },
    select: {
      id: true,
      tenantId: true,
      deadlineAt: true,
      exam: { select: { offlineGraceMin: true } },
      candidate: { select: { sitting: { select: { pausedAt: true } } } },
    },
    take: 500,
  });
  let submitted = 0;
  for (const a of due) {
    if (a.candidate.sitting?.pausedAt) continue; // The whole room is paused.
    const graceEnds = a.deadlineAt.getTime() + Math.max(0, a.exam.offlineGraceMin) * 60_000 + 30_000;
    if (now.getTime() < graceEnds) continue;
    const ok = await inTenant(a.tenantId, () => finalizeAttempt(a.id, "TIME_UP"));
    if (ok) submitted++;
  }

  // Exams past their closing time with nobody still writing are closed.
  const closing = await rawPrisma.exam.findMany({
    where: { status: "PUBLISHED", closesAt: { lt: now } },
    select: { id: true, tenantId: true, offlineGraceMin: true, closesAt: true, attempts: { where: { status: { in: ["IN_PROGRESS", "PAUSED", "LOCKED"] } }, select: { id: true } } },
    take: 200,
  });
  let closed = 0;
  for (const e of closing) {
    if (e.attempts.length) continue;
    if (now.getTime() < e.closesAt!.getTime() + e.offlineGraceMin * 60_000) continue;
    await rawPrisma.exam.update({ where: { id: e.id }, data: { status: "CLOSED" } });
    await rawPrisma.activityLog.create({
      data: { tenantId: e.tenantId, actorType: "SYSTEM", action: "exam.closed", targetType: "Exam", targetId: e.id },
    });
    closed++;
  }
  return { submitted, closed };
}

/** Exams set to release "after close": release once closed and marked. */
export async function releaseAfterClose(): Promise<number> {
  const exams = await rawPrisma.exam.findMany({
    where: { status: "CLOSED", resultRelease: "AFTER_CLOSE", attempts: { some: { releasedAt: null, gradingStatus: "GRADED" } } },
    select: { id: true, tenantId: true },
    take: 100,
  });
  let n = 0;
  for (const e of exams) n += await inTenant(e.tenantId, () => releaseResults(e.id));
  return n;
}

/** An in-app reminder to each learner candidate about an hour before their exam opens. */
export async function examReminders(now = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + 75 * 60_000);
  const exams = await rawPrisma.exam.findMany({
    where: { status: "PUBLISHED", opensAt: { gt: now, lt: soon } },
    select: { id: true, tenantId: true, title: true, opensAt: true, candidates: { where: { clientId: { not: null } }, select: { clientId: true } } },
    take: 100,
  });
  let sent = 0;
  for (const e of exams) {
    const marker = `exam-reminder:${e.id}`;
    const already = new Set(
      (await rawPrisma.notification.findMany({ where: { tenantId: e.tenantId, body: { contains: marker } }, select: { clientId: true } })).map((n) => n.clientId)
    );
    const rows = e.candidates
      .map((c) => c.clientId!)
      .filter((id) => !already.has(id))
      .map((clientId) => ({
        tenantId: e.tenantId,
        clientId,
        category: "REMINDER" as const,
        title: `“${e.title}” starts soon`,
        body: `Your exam opens at ${e.opensAt!.toISOString().slice(11, 16)} UTC. Check your device and connection, then open My exams. [${marker}]`,
      }));
    if (rows.length) {
      await rawPrisma.notification.createMany({ data: rows });
      sent += rows.length;
    }
  }
  return sent;
}
