/** How much each project moved per work day over recent weeks, for the dashboard's heatmap. */
import type { DatedEntry } from './logs.ts';
import type { Issue, Project } from './store.ts';
import { addDays, weekStart, workDay, workDayOf } from './workday.ts';

/** Moves per work day: each issue transition, comment, log entry and commit (`commits`: git times) counts once. */
export function moves(project: Project, issues: Issue[], logs: DatedEntry[], commits: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (day: string) => counts.set(day, (counts.get(day) ?? 0) + 1);
  for (const t of commits) add(workDay(new Date(t)));
  for (const t of issues) {
    if (t.project !== project.key) continue;
    for (const x of t.transitions ?? []) add(workDayOf(x.at));
    for (const c of t.comments) add(workDayOf(c.at));
  }
  for (const e of logs) if (e.project === project.key) add(e.day);
  return counts;
}

export interface HeatRow {
  project: string;
  /** Moves per day of the range; `null` for days not yet reached. */
  counts: (number | null)[];
  /** Latest work day with any move in the data given, which may reach back past the range. */
  lastMoved?: string;
}

export interface Heatmap {
  /** Every day of the range, Monday `weeks - 1` weeks back to this week's Sunday. */
  days: string[];
  rows: HeatRow[];
}

/** The range `heatmap` covers, for loading commits and log entries. */
export function heatRange(day: string, weeks: number): { from: string; to: string } {
  const from = addDays(weekStart(day), -7 * (weeks - 1));
  return { from, to: addDays(from, 7 * weeks - 1) };
}

/** One row per project, in the order given. `commits` maps project keys to git commit times. */
export function heatmap(
  projects: Project[],
  issues: Issue[],
  logs: DatedEntry[],
  commits: Record<string, string[]>,
  day: string,
  weeks = 8,
): Heatmap {
  const { from } = heatRange(day, weeks);
  const days = Array.from({ length: 7 * weeks }, (_, i) => addDays(from, i));
  const rows = projects.map((p) => {
    const counts = moves(p, issues, logs, commits[p.key] ?? []);
    const past = [...counts.keys()].filter((d) => d <= day).sort();
    return {
      project: p.key,
      counts: days.map((d) => (d > day ? null : (counts.get(d) ?? 0))),
      ...(past.length && { lastMoved: past.at(-1) }),
    };
  });
  return { days, rows };
}

/** Shade step 0–4 for a day's moves. */
export function heatLevel(n: number): 0 | 1 | 2 | 3 | 4 {
  return n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;
}
