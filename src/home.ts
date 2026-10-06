/** The dashboard home page's derived views: what's In flight, and a timeline of recent work days. */
import type { GrillSession } from './grill.ts';
import type { DatedEntry } from './logs.ts';
import type { Issue, IssueStatus, Project } from './store.ts';
import { addDays, daysBetween, workDayOf } from './workday.ts';

/** Work days without activity after which a `doing` issue is Idle. */
export const IDLE_DAYS = 3;

/** The latest of the issue's transitions, comments and linked log entries. Commits and `updated` don't count. */
export function issueActivity(issue: Issue, logs: DatedEntry[]): string | undefined {
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
  return t ? workDayOf(t.at) : issue.updated;
}

export interface InFlightIssue {
  issue: Issue;
  /** Only when Idle. */
  idleDays?: number;
}

export interface InFlight {
  /** Idle first, then most recent activity first. */
  issues: InFlightIssue[];
  /** In-progress sessions tagged with a project that no issue links to yet. */
  grill: GrillSession[];
}

/** `logs` must reach back to the earliest `doingSince` of the doing issues, so their activity is complete. */
export function inFlight(projects: Project[], issues: Issue[], logs: DatedEntry[], grill: GrillSession[], today: string): InFlight {
  const active = new Set(projects.filter((p) => p.status === 'active').map((p) => p.key));
  const rows = issues
    .filter((t) => t.status === 'doing' && active.has(t.project))
    .map((issue) => {
      const last = issueActivity(issue, logs);
      const idle = daysBetween(last ? workDayOf(last) : issue.updated, today);
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

export type TimelineEvent =
  | { type: 'transition'; at: string; issue: Issue; to: IssueStatus }
  | { type: 'log'; at: string; entry: DatedEntry };

export type TimelineDay = { day: string; events: TimelineEvent[] } | { gap: { from: string; to: string } };

const TIMELINE_STATUSES: readonly IssueStatus[] = ['doing', 'done', 'dropped'];

/**
 * Work days `from`..`to`, newest first, each with its log entries and its issues' moves to doing/done/dropped,
 * newest first. An issue shows once, at its latest such move in the window. A run of consecutive days with
 * nothing collapses into one gap. Archived projects are left out.
 */
export function timeline(projects: Project[], issues: Issue[], logs: DatedEntry[], from: string, to: string): TimelineDay[] {
  const archived = new Set(projects.filter((p) => p.status === 'archived').map((p) => p.key));
  const byDay = new Map<string, TimelineEvent[]>();
  const add = (day: string, e: TimelineEvent) => {
    if (day < from || day > to) return;
    const list = byDay.get(day);
    if (list) list.push(e);
    else byDay.set(day, [e]);
  };
  for (const issue of issues) {
    if (archived.has(issue.project)) continue;
    const t = issue.transitions?.findLast((x) => x.from && TIMELINE_STATUSES.includes(x.to) && workDayOf(x.at) >= from && workDayOf(x.at) <= to);
    if (t) add(workDayOf(t.at), { type: 'transition', at: t.at, issue, to: t.to });
  }
  for (const entry of logs) {
    if (!archived.has(entry.project)) add(entry.day, { type: 'log', at: entry.at, entry });
  }

  const out: TimelineDay[] = [];
  for (let day = to; day >= from; day = addDays(day, -1)) {
    const events = byDay.get(day);
    const prev = out.at(-1);
    if (events) out.push({ day, events: events.sort((a, b) => b.at.localeCompare(a.at)) });
    else if (prev && 'gap' in prev) prev.gap.from = day;
    else out.push({ gap: { from: day, to: day } });
  }
  return out;
}
