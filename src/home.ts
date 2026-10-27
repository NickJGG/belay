/** The dashboard's derived views: what's In flight, the Activity of recent work days, and Home's activity grid. */
import type { GrillSession } from './grill.ts';
import type { DatedEntry } from './logs.ts';
import type { Issue, IssueStatus, Project } from './store.ts';
import { addDays, dayOfWeek, daysBetween, updatedDay, workDayOf } from './workday.ts';

/** Work days without a transition, comment or linked log entry after which a `doing` issue is Idle. */
export const IDLE_DAYS = 3;

/** The latest of the issue's transitions, comments and linked log entries. Commits and `updated` don't count. */
export function lastTouch(issue: Issue, logs: DatedEntry[]): string | undefined {
  const times = [
    ...(issue.transitions ?? []).map((t) => t.at),
    ...issue.comments.map((c) => c.at),
    ...logs.filter((e) => e.issue === issue.id).map((e) => e.at),
  ];
  return times.reduce<string | undefined>((a, b) => (!a || b > a ? b : a), undefined);
}

/** The work day the issue last moved to `doing`, or its `updated` day when no transition says. */
export function doingSince(issue: Issue): string {
  const t = issue.transitions?.findLast((x) => x.to === 'doing');
  return t ? workDayOf(t.at) : updatedDay(issue);
}

interface InFlightIssue {
  issue: Issue;
  /** Only when Idle. */
  idleDays?: number;
}

export interface InFlight {
  /** Idle first, then most recently touched first. */
  issues: InFlightIssue[];
  /** In-progress sessions tagged with a project that no issue links to yet. */
  grill: GrillSession[];
}

/** `logs` must reach back to the earliest `doingSince` of the doing issues, so their last touch is found. */
export function inFlight(projects: Project[], issues: Issue[], logs: DatedEntry[], grill: GrillSession[], today: string): InFlight {
  const active = new Set(projects.filter((p) => p.status === 'active').map((p) => p.key));
  const rows = issues
    .filter((t) => t.status === 'doing' && active.has(t.project))
    .map((issue) => {
      const last = lastTouch(issue, logs);
      const idle = daysBetween(last ? workDayOf(last) : updatedDay(issue), today);
      return {
        last: last ?? issue.updated,
        row: { issue, ...(idle >= IDLE_DAYS && { idleDays: idle }) },
      };
    })
    .sort((a, b) => Number(b.row.idleDays !== undefined) - Number(a.row.idleDays !== undefined) || b.last.localeCompare(a.last));
  const linked = new Set(issues.map((t) => t.grill));
  return {
    issues: rows.map((r) => r.row),
    grill: grill.filter((g) => g.status === 'in-progress' && g.project && !linked.has(g.slug)).map((g) => ({ ...g, project: g.project!.toUpperCase() })),
  };
}

export type ActivityEvent =
  | { type: 'transition'; at: string; issue: Issue; to: IssueStatus }
  | { type: 'log'; at: string; entry: DatedEntry };

export type ActivityDay = { day: string; events: ActivityEvent[] } | { gap: { from: string; to: string } };

const ACTIVITY_STATUSES: readonly IssueStatus[] = ['doing', 'done', 'dropped'];

/**
 * Activity: work days `from`..`to`, newest first, each with its log entries and its issues' moves to
 * doing/done/dropped, newest first. An issue shows once, at its latest such move in the window. A run of
 * consecutive days with nothing collapses into one gap. Archived projects are left out, unless `project`
 * scopes it to one project, archived or not. `doneOnly` keeps just each issue's latest move to done, without log
 * entries (Home's Recent activity).
 */
export function activity(
  projects: Project[],
  issues: Issue[],
  logs: DatedEntry[],
  from: string,
  to: string,
  { project, doneOnly = false }: { project?: string; doneOnly?: boolean } = {},
): ActivityDay[] {
  const archived = new Set(projects.filter((p) => p.status === 'archived').map((p) => p.key));
  const skip = (key: string) => (project ? key !== project : archived.has(key));
  const byDay = new Map<string, ActivityEvent[]>();
  const add = (day: string, e: ActivityEvent) => {
    if (day < from || day > to) return;
    const list = byDay.get(day);
    if (list) list.push(e);
    else byDay.set(day, [e]);
  };
  const statuses: readonly IssueStatus[] = doneOnly ? ['done'] : ACTIVITY_STATUSES;
  for (const issue of issues) {
    if (skip(issue.project)) continue;
    const t = issue.transitions?.findLast((x) => x.from && statuses.includes(x.to) && workDayOf(x.at) >= from && workDayOf(x.at) <= to);
    if (t) add(workDayOf(t.at), { type: 'transition', at: t.at, issue, to: t.to });
  }
  for (const entry of doneOnly ? [] : logs) {
    if (!skip(entry.project)) add(entry.day, { type: 'log', at: entry.at, entry });
  }

  const out: ActivityDay[] = [];
  for (let day = to; day >= from; day = addDays(day, -1)) {
    const events = byDay.get(day);
    const prev = out.at(-1);
    if (events) out.push({ day, events: events.sort((a, b) => b.at.localeCompare(a.at)) });
    else if (prev && 'gap' in prev) prev.gap.from = day;
    else out.push({ gap: { from: day, to: day } });
  }
  return out;
}

export interface GridDay {
  day: string;
  /** Issues moved to done that day. */
  done: number;
  lessons: number;
  /** 0 when nothing happened, else 1–4: the day's score in quarters of the busiest day's. */
  level: number;
  future: boolean;
}

/** A lesson outweighs an issue moved to done. */
const LESSON_WEIGHT = 5;

/**
 * Home's activity grid: last week and this week, Sunday first. A day scores its issues moved to done (by
 * transition, not `updated`) plus LESSON_WEIGHT per lesson in `lessonDays` (one entry per lesson). Grills and
 * commits don't count; archived projects are left out.
 */
export function activityGrid(projects: Project[], issues: Issue[], lessonDays: string[], today: string): GridDay[] {
  const from = addDays(today, -dayOfWeek(today) - 7);
  const days = Array.from({ length: 14 }, (_, i) => addDays(from, i));
  const archived = new Set(projects.filter((p) => p.status === 'archived').map((p) => p.key));
  const done = new Map<string, number>();
  for (const issue of issues) {
    if (archived.has(issue.project)) continue;
    const doneDays = new Set((issue.transitions ?? []).filter((t) => t.from && t.to === 'done').map((t) => workDayOf(t.at)));
    for (const day of doneDays) done.set(day, (done.get(day) ?? 0) + 1);
  }
  const lessons = new Map<string, number>();
  for (const day of lessonDays) lessons.set(day, (lessons.get(day) ?? 0) + 1);

  const rows = days.map((day) => {
    const future = day > today;
    const d = future ? 0 : (done.get(day) ?? 0);
    const l = future ? 0 : (lessons.get(day) ?? 0);
    return { day, done: d, lessons: l, score: d + LESSON_WEIGHT * l, future };
  });
  const max = Math.max(0, ...rows.map((r) => r.score));
  return rows.map(({ score, ...r }) => ({ ...r, level: score ? Math.ceil((score / max) * 4) : 0 }));
}
