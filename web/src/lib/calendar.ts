/*
 * Date maths for the course calendar. Days are `YYYY-MM-DD` strings and months are 0-based, both read in UTC
 * so a day never shifts with the machine's timezone.
 */

export type Month = { year: number; month: number };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const utc = (day: string) => new Date(`${day}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const monthOf = (day: string): Month => ({ year: +day.slice(0, 4), month: +day.slice(5, 7) - 1 });

export function shiftMonth({ year, month }: Month, by: number): Month {
  const m = year * 12 + month + by;
  return { year: Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
}

/** The month's name, with its year when that isn't `today`'s. */
export function monthTitle({ year, month }: Month, today: string): string {
  return year === monthOf(today).year ? MONTHS[month] : `${MONTHS[month]} ${year}`;
}

/** A Sunday-first grid: null for the blanks before the 1st, then each day of the month. */
export function monthGrid({ year, month }: Month): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push(iso(new Date(Date.UTC(year, month, d))));
  return cells;
}

/** Today, Tomorrow, or a short date such as "Tue 20 Oct". */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  const next = utc(today);
  next.setUTCDate(next.getUTCDate() + 1);
  if (day === iso(next)) return "Tomorrow";
  const d = utc(day);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}

/** How many of `dues` fall on each day; anything already overdue is counted on `today`. */
export function forecast(dues: string[], today: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const due of dues) {
    const day = due < today ? today : due;
    out[day] = (out[day] ?? 0) + 1;
  }
  return out;
}
