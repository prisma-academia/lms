import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { expandOccurrences } from "@/lib/calendar/occurrences";
import { PageHeader } from "@/components/shell";
import { MonthCalendar } from "@/components/month-calendar";

function parseMonth(month: string | undefined): { year: number; month: number } {
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : null;
  const now = new Date();
  if (!m) return { year: now.getFullYear(), month: now.getMonth() };
  const [y, mo] = m.split("-").map(Number);
  return { year: y, month: Math.min(11, Math.max(0, mo - 1)) };
}

export default async function ClientCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await requireClientPage();
  const { month } = await searchParams;
  const { year, month: month0 } = parseMonth(month);

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

  const rangeStart = new Date(year, month0, 1);
  const rangeEnd = new Date(year, month0 + 1, 0, 23, 59, 59);
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
      <PageHeader title="Calendar" subtitle="Sessions, deadlines and announcements for you." />
      <MonthCalendar year={year} month={month0} occurrences={occurrences} basePath="/calendar" />
    </div>
  );
}
