export type EventSeed = {
  title: string;
  description: string;
  type: "LIVE_SESSION" | "DEADLINE" | "REMINDER" | "ANNOUNCEMENT";
  startInDays: number;
  endInHours?: number;
  audience: "ALL" | "CLIENT" | "GROUP";
  recurrence?: "NONE" | "WEEKLY";
  recurrenceWeeks?: number;
};

export const EVENT_CATALOG: EventSeed[] = [
  {
    title: "WAEC Biology revision webinar",
    description: "Live Q&A with Dr. Adeyemi on cell biology and osmosis — bring your past questions.",
    type: "LIVE_SESSION",
    startInDays: 3,
    endInHours: 2,
    audience: "GROUP",
  },
  {
    title: "JavaScript assignment due",
    description: "Phone number formatting exercise is due by 11:59 PM WAT.",
    type: "DEADLINE",
    startInDays: 1,
    audience: "ALL",
  },
  {
    title: "Weekly study reminder",
    description: "Don't break your streak — complete at least one lesson this week.",
    type: "REMINDER",
    startInDays: 0,
    audience: "ALL",
    recurrence: "WEEKLY",
    recurrenceWeeks: 8,
  },
  {
    title: "Welcome to Greenfield Academy",
    description: "New term starts Monday. Check your courses and join the WAEC cohort group.",
    type: "ANNOUNCEMENT",
    startInDays: -2,
    audience: "ALL",
  },
  {
    title: "1-on-1 portfolio review",
    description: "Rashida — book a slot to review your graphic design portfolio before certification.",
    type: "LIVE_SESSION",
    startInDays: 5,
    endInHours: 1,
    audience: "CLIENT",
  },
  {
    title: "Public holiday — no live sessions",
    description: "Academy offices closed; recorded lessons remain available.",
    type: "ANNOUNCEMENT",
    startInDays: 10,
    audience: "ALL",
  },
];
