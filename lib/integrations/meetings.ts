import { prisma } from "@/lib/db/client";
import { runWithContext } from "@/lib/db/tenant-context";
import { logger } from "@/lib/logger";
import { configOf, markError, markOk, openSecrets } from "@/lib/integrations/store";
import { MEETING_PROVIDERS } from "@/lib/integrations/registry";
import { createZoomMeeting, updateZoomMeeting, type ZoomCredentials, type ZoomMeetingInput } from "@/lib/integrations/zoom";
import { googleEventMeetLink, insertGoogleEvent, patchGoogleEvent, type GoogleEventInput } from "@/lib/integrations/google";
import type { Event, TenantIntegration } from "@/lib/generated/prisma/client";

/**
 * Auto-created meeting links for LIVE_SESSION events, through whichever
 * meeting provider the academy switched "auto-create" on for (Zoom or Google
 * Calendar + Meet; turning one on turns the other off).
 *
 * Called by the event create / update routes after the event is saved.
 * Contract: never throws, never blocks longer than ~15 s, and returns the join
 * URL it put on the event (or null when it did nothing). A provider failure is
 * recorded on the integration's row, and the event is saved regardless.
 */

const BUDGET_MS = 15_000;

function durationMin(ev: Pick<Event, "startAt" | "endAt">): number {
  if (!ev.endAt) return 60;
  return Math.max(15, Math.round((ev.endAt.getTime() - ev.startAt.getTime()) / 60_000));
}

function zoomInput(ev: Event): ZoomMeetingInput {
  return { topic: ev.title, agenda: ev.description, start: ev.startAt, durationMin: durationMin(ev), recurring: ev.recurrence !== "NONE" };
}

function googleInput(ev: Event): GoogleEventInput {
  return {
    requestId: `lms-${ev.id}`,
    summary: ev.title,
    description: ev.description,
    location: ev.location,
    start: ev.startAt,
    end: ev.endAt && ev.endAt > ev.startAt ? ev.endAt : new Date(ev.startAt.getTime() + 60 * 60_000),
    repeat: ev.recurrence !== "NONE" ? { freq: ev.recurrence, until: ev.recurrenceUntil } : null,
  };
}

/** Zoom credentials: the ids are settings, the secret is sealed. */
export function zoomCredsOf(row: TenantIntegration): ZoomCredentials {
  const c = configOf(row);
  return { accountId: String(c.accountId ?? ""), clientId: String(c.clientId ?? ""), clientSecret: openSecrets(row).clientSecret ?? "" };
}

async function create(row: TenantIntegration, ev: Event): Promise<{ externalId: string; joinUrl: string } | null> {
  const s = openSecrets(row);
  if (row.provider === "zoom") {
    const m = await createZoomMeeting(zoomCredsOf(row), zoomInput(ev));
    return { externalId: m.id, joinUrl: m.joinUrl };
  }
  if (!s.refreshToken) throw new Error("Google Calendar is not connected.");
  const g = await insertGoogleEvent(s.refreshToken, googleInput(ev));
  const joinUrl = g.joinUrl ?? (await googleEventMeetLink(s.refreshToken, g.id));
  if (!joinUrl) throw new Error("Google created the calendar event but no Meet link (is Meet enabled for this Google account?).");
  return { externalId: g.id, joinUrl };
}

async function update(row: TenantIntegration, ev: Event, externalId: string): Promise<void> {
  const s = openSecrets(row);
  if (row.provider === "zoom") {
    await updateZoomMeeting(zoomCredsOf(row), externalId, zoomInput(ev));
    return;
  }
  if (s.refreshToken) await patchGoogleEvent(s.refreshToken, externalId, googleInput(ev));
}

async function sync(tenantId: string, eventId: string): Promise<string | null> {
  const ev = await prisma.event.findFirst({ where: { id: eventId, tenantId } });
  if (!ev || ev.type !== "LIVE_SESSION") return null;

  const rows = await prisma.tenantIntegration.findMany({
    where: { tenantId, provider: { in: [...MEETING_PROVIDERS] }, status: { in: ["CONNECTED", "ERROR"] } },
    orderBy: { updatedAt: "desc" },
  });
  const row = rows.find((r) => configOf(r).autoCreate === true);
  if (!row) return null;

  try {
    const existing = await prisma.integrationMeeting.findFirst({ where: { tenantId, eventId: ev.id, provider: row.provider } });
    if (existing) {
      // The academy pasted its own link over ours: leave both alone.
      if (ev.url && ev.url !== existing.joinUrl) return null;
      await update(row, ev, existing.externalId);
      await markOk(row.id);
      if (!ev.url) {
        await prisma.event.update({ where: { id: ev.id }, data: { url: existing.joinUrl } });
        return existing.joinUrl;
      }
      return null;
    }
    if (ev.url) return null; // A link was given; nothing to create.

    const made = await create(row, ev);
    if (!made) return null;
    await prisma.integrationMeeting.create({
      data: { tenantId, integrationId: row.id, eventId: ev.id, provider: row.provider, externalId: made.externalId, joinUrl: made.joinUrl },
    });
    await prisma.event.update({ where: { id: ev.id }, data: { url: made.joinUrl } });
    await markOk(row.id);
    return made.joinUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create the meeting.";
    logger.warn({ err, tenantId, eventId, provider: row.provider }, "meeting_sync_failed");
    await markError(row.id, `Live session “${ev.title.slice(0, 60)}”: ${message}`).catch(() => undefined);
    return null;
  }
}

export async function syncLiveSessionMeeting(tenantId: string, eventId: string): Promise<string | null> {
  try {
    const work = runWithContext({ mode: "tenant-admin", tenantId }, () => sync(tenantId, eventId));
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), BUDGET_MS));
    return await Promise.race([Promise.resolve(work), timeout]);
  } catch (err) {
    logger.error({ err, tenantId, eventId }, "meeting_sync_crashed");
    return null;
  }
}
