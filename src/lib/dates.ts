/** All dates use Nigeria time (Africa/Lagos, UTC+1, no daylight saving). */
export const TIME_ZONE = "Africa/Lagos";

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar date in Lagos for a moment in time, as YYYY-MM-DD. */
export function lagosDate(at: Date = new Date()): string {
  return isoDateFormatter.format(at);
}

/** "2026-10-01" → "01/10/2026" */
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Add whole days to a YYYY-MM-DD date. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Monday of the week containing the date (weeks run Monday to Sunday). */
export function startOfWeek(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const sinceMonday = (weekday + 6) % 7;
  return addDays(isoDate, -sinceMonday);
}

export function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}
