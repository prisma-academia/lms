import { prisma } from "@/lib/db/client";
import { rawPrisma } from "@/lib/db/raw-client";
import { hashOpaqueToken, newOpaqueToken } from "@/lib/auth/tokens";
import { tenantHttpOrigin } from "@/lib/url/tenant";
import { env } from "@/lib/env";
import { expandOccurrences } from "@/lib/calendar/occurrences";
import { learnerExamList } from "@/lib/exams/access";
import { buildIcs, type IcsEvent } from "@/lib/calendar/ics";
import type { Event } from "@/lib/generated/prisma/client";

/**
 * Private calendar subscription feeds (ICS), one per learner or staff member.
 *
 * The URL carries a 256-bit random token; only its sha256 is stored, so the
 * URL is shown once (create / rotate) and a leaked one is revoked by rotating.
 * Feeds open without a session — that is the point: Google, Apple and Outlook
 * fetch them from their own servers — so the token is the whole credential,
 * and it only works on its academy's host.
 */

export type FeedOwner = { type: "CLIENT" | "TENANT"; id: string };

export const FEED_PATH = "/api/calendar";

export function feedUrls(slug: string, token: string): { https: string; webcal: string } {
  const https = `${tenantHttpOrigin(slug)}${FEED_PATH}/${token}.ics`;
  return { https, webcal: https.replace(/^https?:/, "webcal:") };
}

export async function feedStatus(tenantId: string, owner: FeedOwner) {
  const row = await prisma.calendarFeedToken.findFirst({
    where: { tenantId, ownerType: owner.type, ownerId: owner.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, lastUsedAt: true },
  });
  return row ? { active: true, createdAt: row.createdAt.toISOString(), lastUsedAt: row.lastUsedAt?.toISOString() ?? null } : { active: false, createdAt: null, lastUsedAt: null };
}

/** Revoke any live token and mint a new one. Returns the raw token (show once). */
export async function rotateFeed(tenantId: string, owner: FeedOwner): Promise<string> {
  await prisma.calendarFeedToken.updateMany({
    where: { tenantId, ownerType: owner.type, ownerId: owner.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const raw = newOpaqueToken();
  await prisma.calendarFeedToken.create({
    data: { tenantId, ownerType: owner.type, ownerId: owner.id, tokenHash: hashOpaqueToken(raw) },
  });
  return raw;
}

export async function revokeFeed(tenantId: string, owner: FeedOwner): Promise<number> {
  const r = await prisma.calendarFeedToken.updateMany({
    where: { tenantId, ownerType: owner.type, ownerId: owner.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return r.count;
}

/** Look a token up by hash, before any tenant context exists (raw client). */
export async function findFeedToken(raw: string) {
  if (!raw || raw.length < 20 || raw.length > 200 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  const row = await rawPrisma.calendarFeedToken.findUnique({ where: { tokenHash: hashOpaqueToken(raw) } });
  if (!row || row.revokedAt) return null;
  return row;
}

export async function touchFeedToken(id: string): Promise<void> {
  // At most one write per ten minutes per feed; calendar apps poll often.
  await rawPrisma.calendarFeedToken.updateMany({
    where: { id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(Date.now() - 10 * 60_000) } }] },
    data: { lastUsedAt: new Date() },
  });
}

/* ───────────────────────────── building ───────────────────────────── */

const LOOKBACK_MS = 60 * 24 * 60 * 60_000; // two months back
const HORIZON_MS = 183 * 24 * 60 * 60_000; // six months ahead

const TYPE_LABEL: Record<string, string> = {
  LIVE_SESSION: "Live session",
  DEADLINE: "Deadline",
  REMINDER: "Reminder",
  ANNOUNCEMENT: "Announcement",
};

function defaultEnd(ev: Pick<Event, "type" | "startAt" | "endAt">): Date {
  if (ev.endAt && ev.endAt > ev.startAt) return ev.endAt;
  return new Date(ev.startAt.getTime() + (ev.type === "LIVE_SESSION" ? 60 : 30) * 60_000);
}

function describe(ev: Pick<Event, "description" | "url">): string | null {
  const parts = [ev.description?.trim(), ev.url ? `Join: ${ev.url}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * Calendar events → VEVENTs. Daily and weekly repeats become an RRULE (the
 * learner calendar adds whole days / weeks, which is what RRULE does too).
 * Monthly repeats are written out one by one over the horizon: the calendar
 * page steps month by month from the previous date (31 Jan → 28 Feb → 28 Mar),
 * which no RRULE expresses, and the feed must show the same dates.
 */
export function eventsToIcs(events: Event[], uidHost: string, now: Date): IcsEvent[] {
  const out: IcsEvent[] = [];
  const from = new Date(now.getTime() - LOOKBACK_MS);
  const to = new Date(now.getTime() + HORIZON_MS);
  for (const ev of events) {
    const base = {
      summary: ev.type === "LIVE_SESSION" || ev.type === "ANNOUNCEMENT" ? ev.title : `${TYPE_LABEL[ev.type] ?? ev.type}: ${ev.title}`,
      description: describe(ev),
      location: ev.location ?? (ev.type === "LIVE_SESSION" ? ev.url : null),
      url: ev.url,
      lastModified: ev.updatedAt,
      categories: [TYPE_LABEL[ev.type] ?? ev.type],
    };
    const length = defaultEnd(ev).getTime() - ev.startAt.getTime();
    if (ev.recurrence === "DAILY" || ev.recurrence === "WEEKLY") {
      if (ev.recurrenceUntil && ev.recurrenceUntil < from) continue;
      out.push({ ...base, uid: `event-${ev.id}@${uidHost}`, start: ev.startAt, end: defaultEnd(ev), repeat: { freq: ev.recurrence, until: ev.recurrenceUntil } });
    } else if (ev.recurrence === "MONTHLY") {
      const occ = expandOccurrences(
        [{ id: ev.id, title: ev.title, type: ev.type, startAt: ev.startAt, endAt: ev.endAt, recurrence: ev.recurrence, recurrenceUntil: ev.recurrenceUntil }],
        from,
        to
      );
      for (const o of occ) {
        const stamp = o.date.toISOString().slice(0, 10).replace(/-/g, "");
        out.push({ ...base, uid: `event-${ev.id}-${stamp}@${uidHost}`, start: o.date, end: new Date(o.date.getTime() + length) });
      }
    } else {
      if (ev.startAt < from || ev.startAt > to) continue;
      out.push({ ...base, uid: `event-${ev.id}@${uidHost}`, start: ev.startAt, end: defaultEnd(ev) });
    }
  }
  return out;
}

type ExamLike = { id: string; title: string; code: string | null; durationMin: number; opensAt: Date | null; closesAt: Date | null; updatedAt: Date };
type SittingLike = { id: string; name: string; startsAt: Date | null; endsAt: Date | null; venue: string | null };

function examEvents(exam: ExamLike, sittings: SittingLike[], origin: string, uidHost: string, extraPct = 0, staff = false): IcsEvent[] {
  const url = staff ? `${origin}/admin/exams/${exam.id}` : `${origin}/exam/${exam.id}`;
  const minutes = Math.round(exam.durationMin * (1 + extraPct / 100));
  const label = exam.code ? `${exam.title} (${exam.code})` : exam.title;
  const timed = sittings.filter((s) => s.startsAt);
  if (timed.length > 0) {
    return timed.map((s) => ({
      uid: `exam-${exam.id}-sitting-${s.id}@${uidHost}`,
      start: s.startsAt!,
      end: s.endsAt && s.endsAt > s.startsAt! ? s.endsAt : new Date(s.startsAt!.getTime() + minutes * 60_000),
      summary: `Exam: ${label}`,
      description: `${s.name}. Duration ${minutes} minutes.\n\nOpen the exam: ${url}`,
      location: s.venue,
      url,
      lastModified: exam.updatedAt,
      categories: ["Exam"],
    }));
  }
  if (!exam.opensAt) return [];
  return [
    {
      uid: `exam-${exam.id}@${uidHost}`,
      start: exam.opensAt,
      end: exam.closesAt && exam.closesAt > exam.opensAt ? exam.closesAt : new Date(exam.opensAt.getTime() + minutes * 60_000),
      summary: `Exam window: ${label}`,
      description: `Start any time in this window. Duration ${minutes} minutes.\n\nOpen the exam: ${url}`,
      url,
      lastModified: exam.updatedAt,
      categories: ["Exam"],
    },
  ];
}

function uidHostFor(slug: string): string {
  return `${slug}.${env.APP_DOMAIN.split(":")[0]}`;
}

/** A learner's feed: the same events the learner calendar shows, plus their exams. Call inside tenant context. */
export async function learnerFeed(tenant: { id: string; slug: string; name: string }, clientId: string, now = new Date()): Promise<string> {
  const memberships = await prisma.clientGroupMembership.findMany({ where: { clientId }, select: { groupId: true } });
  const groupIds = memberships.map((m) => m.groupId);
  // Audience rules exactly as app/c/(dashboard)/calendar/page.tsx applies them.
  const events = await prisma.event.findMany({
    where: {
      tenantId: tenant.id,
      OR: [
        { audience: "ALL" },
        { audience: "CLIENT", clientId },
        ...(groupIds.length > 0 ? [{ audience: "GROUP" as const, clientGroupId: { in: groupIds } }] : []),
      ],
    },
    orderBy: { startAt: "asc" },
    take: 2000,
  });
  const origin = tenantHttpOrigin(tenant.slug);
  const host = uidHostFor(tenant.slug);
  const items = eventsToIcs(events, host, now);

  // Exams exactly as "My exams" lists them (lib/exams/access.ts).
  const { candidates, auto } = await learnerExamList(clientId);
  for (const c of candidates) {
    if (c.status !== "ACTIVE") continue;
    items.push(...examEvents(c.exam, c.sitting ? [c.sitting] : [], origin, host, c.extraTimePct));
  }
  for (const e of auto) items.push(...examEvents(e, [], origin, host));

  return buildIcs({
    prodId: `-//${env.PRODUCT_NAME}//Calendar feed//EN`,
    name: tenant.name,
    description: `Your sessions, deadlines and exams at ${tenant.name}.`,
    generatedAt: now,
    events: items,
  });
}

/** A staff member's feed: every academy event and every published exam. Call inside tenant context. */
export async function staffFeed(tenant: { id: string; slug: string; name: string }, now = new Date()): Promise<string> {
  const events = await prisma.event.findMany({ where: { tenantId: tenant.id }, orderBy: { startAt: "asc" }, take: 3000 });
  const origin = tenantHttpOrigin(tenant.slug);
  const host = uidHostFor(tenant.slug);
  const items = eventsToIcs(events, host, now);
  const exams = await prisma.exam.findMany({
    where: { tenantId: tenant.id, status: { in: ["PUBLISHED", "CLOSED"] } },
    include: { sittings: true },
    take: 500,
  });
  for (const e of exams) items.push(...examEvents(e, e.sittings, origin, host, 0, true));
  return buildIcs({
    prodId: `-//${env.PRODUCT_NAME}//Calendar feed//EN`,
    name: `${tenant.name} (staff)`,
    description: `Every event and published exam at ${tenant.name}.`,
    generatedAt: now,
    events: items,
  });
}
