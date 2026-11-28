import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { expandOccurrences } from "@/lib/calendar/occurrences";
import { PageHeader } from "@/components/shell";
import { MonthCalendar } from "@/components/month-calendar";
import { tenantFormatContext } from "../_lib/format-context";
import { DAY_MS, zonedParts } from "../_lib/zoned";
import { feedStatus } from "@/lib/calendar/feeds";
import { CalendarFeedCard } from "@/components/calendar-feed-card";

function parseMonth(month: string | undefined, timeZone: string): { year: number; month: number } {
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : null;
  if (!m) {
    // "This month" is the academy's month: at 00:30 on the 1st in Lagos the
    // server, on UTC, is still in the month before.
    const today = zonedParts(new Date(), timeZone);
    return { year: today.year, month: today.month };
  }
  const [y, mo] = m.split("-").map(Number);
  return { year: y, month: Math.min(11, Math.max(0, mo - 1)) };
}

export default async function ClientCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await requireClientPage();
  const { month } = await searchParams;
  const format = await tenantFormatContext(actor.tenantId);
  const { year, month: month0 } = parseMonth(month, format.timeZone);

  const memberships = await prisma.clientGroupMembership.findMany({
    where: { clientId: actor.clientId },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);

  const events = await prisma.event.findMany({
    where: {
      OR: [
        { audience: "ALL" },
        { audience: "CLIENT", clientId: actor.clientId },
        ...(groupIds.length > 0 ? [{ audience: "GROUP" as const, clientGroupId: { in: groupIds } }] : []),
      ],
    },
    orderBy: { startAt: "asc" },
    take: 2000,
  });

  // A day wider than the month on each side: the month's first and last days in
  // the academy's zone begin and end at a different instant from UTC's, and an
  // event in that gap would otherwise be dropped here. The calendar keeps only
  // what falls inside the month once each event is placed on its local day.
  const rangeStart = new Date(Date.UTC(year, month0, 1) - DAY_MS);
  const rangeEnd = new Date(Date.UTC(year, month0 + 1, 1) + DAY_MS);
  const feed = await feedStatus(actor.tenantId, { type: "CLIENT", id: actor.clientId });
  const occurrences = expandOccurrences(
    events.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      startAt: e.startAt,
      endAt: e.endAt,
      recurrence: e.recurrence,
      recurrenceUntil: e.recurrenceUntil,
    })),
    rangeStart,
    rangeEnd
  ).map((o) => ({ id: o.id, dateISO: o.date.toISOString(), title: o.title, type: o.type }));

  return (
    <div>
      <PageHeader title="Calendar" subtitle="Live sessions, deadlines and announcements for you" />
      <MonthCalendar
        year={year}
        month={month0}
        occurrences={occurrences}
        basePath="/calendar"
        timeZone={format.timeZone}
        locale={format.locale}
      />
      <div className="mt-6">
        <CalendarFeedCard endpoint="/api/client/calendar-feed" initial={feed} />
      </div>
    </div>
  );
}
