/**
 * Work days: the day activity counts toward ends at 4am local, so late-night work belongs to the day it felt
 * like. Days are `YYYY-MM-DD`; weeks run Monday–Sunday. Stored timestamps stay real local time.
 */
import { DAY_RE, today } from './store.ts';
import { parseAt } from './time.ts';

const CUTOFF_HOUR = 4;

function dateOf(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Wall-clock arithmetic, so a DST change can't shift the result. */
export function workDay(d = new Date()): string {
  return d.getHours() < CUTOFF_HOUR ? today(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)) : today(d);
}

/** The work day of a stored `YYYY-MM-DDTHH:MM`. */
export function workDayOf(at: string): string {
  return workDay(parseAt(at));
}

/** The work day of an issue's `updated`, which is date-only on issues last written before it carried a time. */
export function updatedDay(t: { updated: string }): string {
  return DAY_RE.test(t.updated) ? t.updated : workDayOf(t.updated);
}

export function addDays(day: string, n: number): string {
  const d = dateOf(day);
  return today(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  const utc = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/** 0 for Sunday to 6 for Saturday. */
export function dayOfWeek(day: string): number {
  return dateOf(day).getDay();
}

/** The Monday of `day`'s week. */
export function weekStart(day: string): string {
  return addDays(day, -((dateOf(day).getDay() + 6) % 7));
}

export function weekDays(day: string): string[] {
  const start = weekStart(day);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** A real calendar date in `YYYY-MM-DD` form. */
export function isDay(s: string): boolean {
  return DAY_RE.test(s) && today(dateOf(s)) === s;
}

/** `today`, `yesterday` or `YYYY-MM-DD`, relative to the work day of `now`. */
export function parseDay(value: string, now = new Date()): string {
  const v = value.trim().toLowerCase();
  if (v === 'today') return workDay(now);
  if (v === 'yesterday') return addDays(workDay(now), -1);
  if (isDay(v)) return v;
  throw new Error(`date must be today, yesterday or YYYY-MM-DD (got '${value}')`);
}
