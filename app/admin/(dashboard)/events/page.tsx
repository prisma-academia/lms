import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { expandOccurrences } from "@/lib/calendar/occurrences";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { MonthCalendar } from "@/components/month-calendar";
import { CalendarFeedCard } from "@/components/calendar-feed-card";
import { feedStatus } from "@/lib/calendar/feeds";

function parseMonth(month: string | undefined): { year: number; month: number } {
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : null;
  const now = new Date();
  if (!m) return { year: now.getFullYear(), month: now.getMonth() };
  const [y, mo] = m.split("-").map(Number);
  return { year: y, month: Math.min(11, Math.max(0, mo - 1)) };
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_EVENTS_READ.key);
  const { month } = await searchParams;
  const { year, month: month0 } = parseMonth(month);

  const rangeStart = new Date(year, month0, 1);
  const rangeEnd = new Date(year, month0 + 1, 0, 23, 59, 59);

  const events = await prisma.event.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { startAt: "asc" },
    take: 2000,
  });

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

  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_EVENTS_WRITE.key);
  const feed = await feedStatus(actor.tenantId, { type: "TENANT", id: actor.userId });

  return (
    <div>
      <DataTableToolbar
        title="Calendar"
        description="Live sessions, deadlines, reminders and announcements. Learners see these on their own calendar."
        createHref={canWrite ? "/admin/events/new" : undefined}
        createLabel="New event"
      />
      <MonthCalendar
        year={year}
        month={month0}
        occurrences={occurrences}
        basePath="/admin/events"
        eventHrefPrefix="/admin/events"
      />
      <div className="mt-6">
        <CalendarFeedCard
          endpoint="/api/tenant/calendar-feed"
          initial={feed}
          title="Subscribe in your calendar app"
          description="Every event and published exam in the academy, in Google Calendar, Apple Calendar or Outlook. A private link just for you."
        />
      </div>
    </div>
  );
}
