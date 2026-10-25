/** How belay's records read on the pages: day labels, grill rows' progress, the Projects page's groups. */
import type { DatedEntry } from "../../../src/logs.ts";
import { addDays, daysBetween } from "../../../src/workday.ts";

function dateOf(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** `Today`, `Yesterday`, else `Fri, Oct 2` (with the year when it isn't `today`'s). */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return dateOf(day).toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(day.slice(0, 4) !== today.slice(0, 4) && { year: "numeric" }),
  });
}

/** The weekday within the last week, else `Oct 2`. */
export function shortDay(day: string, today: string): string {
  const options: Intl.DateTimeFormatOptions = daysBetween(day, today) < 7 ? { weekday: "short" } : { month: "short", day: "numeric" };
  return dateOf(day).toLocaleDateString("en", options);
}

export const WEEK = 7;
const MAX_DAYS = 52 * WEEK;

/** An Activity window from `?days=`: a whole number of weeks, one at least and a year at most. */
export function windowDays(raw: string | undefined): number {
  const weeks = Math.floor(Number(raw) / WEEK);
  return Number.isFinite(weeks) && weeks > 1 ? Math.min(weeks * WEEK, MAX_DAYS) : WEEK;
}

/** `3 applied · 1 outreach` */
export function kindTotals(entries: Pick<DatedEntry, "kind" | "count">[]): string {
  const totals = new Map<string, number>();
  for (const e of entries) if (e.kind) totals.set(e.kind, (totals.get(e.kind) ?? 0) + (e.count ?? 1));
  return [...totals].map(([k, n]) => `${n} ${k}`).join(" · ");
}

/** A building grill's `done/total`, for its Grills row; nothing for any other. */
export function grillProgress(g: { stage: "grilling" | "building" | "shipped"; progress?: { done: number; total: number } }): string | undefined {
  return g.stage === "building" && g.progress ? `${g.progress.done}/${g.progress.total}` : undefined;
}

/** The Projects page's groups: Working on (focus or open work), Everything else, then paused and archived. */
export function projectGroups<P extends { status: string; focus: boolean; open: number }>(projects: P[]) {
  const active = projects.filter((p) => p.status === "active");
  return {
    working: active.filter((p) => p.focus || p.open > 0),
    rest: active.filter((p) => !p.focus && !p.open),
    shelved: projects.filter((p) => p.status !== "active"),
  };
}

/** Belay's In flight grills with the live ones moved first, and any live grill its rule left out (no project tag) added. */
export function flightGrills<G extends { slug: string }>(flight: G[], live: G[]): G[] {
  const on = new Set(live.map((g) => g.slug));
  return [...live, ...flight.filter((g) => !on.has(g.slug))];
}
