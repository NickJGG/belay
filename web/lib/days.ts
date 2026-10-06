/** Labels for work days, relative to the current one. Server-only, like `addDays` from `./data`. */
import { addDays, daysBetween } from './data';

function dateOf(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** `Today`, `Yesterday`, else `Fri, Oct 2` (with the year when it isn't `today`'s). */
export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return dateOf(day).toLocaleDateString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(day.slice(0, 4) !== today.slice(0, 4) && { year: 'numeric' }),
  });
}

/** The weekday within the last week, else `Oct 2`. */
export function shortDay(day: string, today: string): string {
  const options: Intl.DateTimeFormatOptions = daysBetween(day, today) < 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' };
  return dateOf(day).toLocaleDateString('en', options);
}
