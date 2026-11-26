/**
 * Words for the values the database stores in capitals.
 *
 * A category arrives as `ANNOUNCEMENT` or `LIVE_SESSION`. Shown as it is, that
 * is the system talking to itself; a learner should read "Announcement".
 */

const KNOWN: Record<string, string> = {
  MESSAGE: "Message",
  ANNOUNCEMENT: "Announcement",
  REMINDER: "Reminder",
  LIVE_SESSION: "Live session",
  DEADLINE: "Deadline",
};

/** "LIVE_SESSION" → "Live session". Anything unknown is tidied the same way. */
export function categoryLabel(value: string | null | undefined): string {
  if (!value) return "";
  const known = KNOWN[value];
  if (known) return known;
  const words = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "";
}

/** "1 lesson", "12 lessons". */
export function countOf(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
