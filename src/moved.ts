/** Moved: whether a project had progress on a work day. Derived, never stored; sessions alone don't count. */
import type { DatedEntry } from './logs.ts';
import type { Issue, Project } from './store.ts';
import { workDay, workDayOf } from './workday.ts';

/** The work days of commit times as `git log` prints them (ISO with offset). */
export function commitDays(times: string[]): string[] {
  return [...new Set(times.map((t) => workDay(new Date(t))))].sort();
}

/** Work days on which `project` had an issue transition, a comment, a log entry or a commit (`commits`: work days). */
export function movedDays(project: Project, issues: Issue[], logs: DatedEntry[], commits: string[]): Set<string> {
  const days = new Set(commits);
  for (const t of issues) {
    if (t.project !== project.key) continue;
    for (const x of t.transitions ?? []) days.add(workDayOf(x.at));
    for (const c of t.comments) days.add(workDayOf(c.at));
  }
  for (const e of logs) if (e.project === project.key) days.add(e.day);
  return days;
}
