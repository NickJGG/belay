/** How belay's records read on the pages: day labels, grill rows' standing, the Projects page's groups. */
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

const issues = (n: number) => (n === 1 ? "1 issue" : `${n} issues`);

export type GrillStanding = {
  live: boolean;
  working?: boolean;
  stage: "grilling" | "building" | "shipped";
  status: string;
  questions?: number;
  progress?: { done: number; total: number };
  next?: { id: string };
};

/** Where a grill stands, for its row: whose turn, its questions, its next issue and progress, or what shipped. */
export function grillStanding(g: GrillStanding): string {
  if (g.live) return g.working ? "Claude is working…" : "your turn";
  if (g.stage === "grilling") return g.questions ? (g.questions === 1 ? "1 question" : `${g.questions} questions`) : "started";
  if (g.stage === "building" && g.progress) {
    const of = `${g.progress.done}/${g.progress.total}`;
    return g.next ? `${g.next.id} · ${of}` : of;
  }
  if (g.status === "abandoned") return "abandoned";
  return `✓ ${g.progress ? issues(g.progress.total) : "no issues"}`;
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

export type FlightIssue = { kind: "issue"; id: string; title: string; project: string; idleDays?: number };

export type FlightGrill = {
  kind: "grill";
  slug: string;
  topic: string;
  live: boolean;
  working?: boolean;
  /** The first open question's number. */
  openQ?: number;
  questions?: number;
};

export type FlightRow = FlightIssue | FlightGrill;

/** What an In flight row says at its right: idle or doing, a live grill's turn, else its open question. */
export function flightWhy(r: FlightRow): string {
  if (r.kind === "issue") return r.idleDays ? `idle ${r.idleDays} days` : "doing";
  if (r.live) return `live · ${r.working ? "Claude is working…" : "your turn"}`;
  if (r.openQ) return `Q${r.openQ} open`;
  return grillStanding({ live: false, stage: "grilling", status: "in-progress", questions: r.questions });
}

/** Belay's In flight grills with the live ones moved first, and any live grill its rule left out (no project tag) added. */
export function flightGrills<G extends { slug: string }>(flight: G[], live: G[]): G[] {
  const on = new Set(live.map((g) => g.slug));
  return [...live, ...flight.filter((g) => !on.has(g.slug))];
}
