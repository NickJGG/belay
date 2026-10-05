/**
 * Goal progress, derived from issues, log entries and moved days. A goal only counts while its project is
 * active and in focus. Wording stays neutral: behind is shown, never scolded.
 */
import type { DatedEntry } from './logs.ts';
import type { Goal, Issue, Project } from './store.ts';
import { daysBetween, weekStart, workDayOf } from './workday.ts';

export type TargetState = 'noscope' | 'ontrack' | 'behind' | 'overdue' | 'done';

/** For ordering: 0 a target that's behind or overdue, 1 a habit or quantity not met today, 2 the rest. */
export type Urgency = 0 | 1 | 2;

export type GoalProgress = { project: string; urgency: Urgency } & (
  | { form: 'habit'; done: number; of: number; metToday: boolean }
  | { form: 'quantity'; kind: string; done: number; of: number; metToday: boolean }
  | { form: 'target'; date: string; state: TargetState; scope: number; left: number; daysLeft: number }
);

export function goalOf(project: Project): Goal | undefined {
  return project.status === 'active' && project.focus ? project.goal : undefined;
}

/** Whether `t` was finished on or after work day `set`; `updated` stands in for issues done before transitions were recorded. */
function doneSince(t: Issue, set: string): boolean {
  if (t.status !== 'done') return false;
  const last = t.transitions?.findLast((x) => x.to === 'done');
  return last ? workDayOf(last.at) >= set : t.updated >= set;
}

/**
 * `day` is the current work day; `logs` must cover its week and `moved` is `movedDays` for the project.
 * Undefined when the project has no goal that counts.
 */
export function goalProgress(project: Project, issues: Issue[], logs: DatedEntry[], moved: Set<string>, day: string): GoalProgress | undefined {
  const goal = goalOf(project);
  if (!goal) return undefined;
  const week = weekStart(day);
  const inWeek = (d: string) => d >= week && d <= day;
  if ('habit' in goal) {
    const metToday = moved.has(day);
    const done = [...moved].filter(inWeek).length;
    return { project: project.key, urgency: metToday ? 2 : 1, form: 'habit', done, of: goal.habit, metToday };
  }
  if ('quantity' in goal) {
    const counted = logs.filter((e) => e.project === project.key && e.kind === goal.kind && inWeek(e.day));
    const done = counted.reduce((n, e) => n + (e.count ?? 1), 0);
    const metToday = counted.some((e) => e.day === day);
    return { project: project.key, urgency: metToday ? 2 : 1, form: 'quantity', kind: goal.kind, done, of: goal.quantity, metToday };
  }
  const own = issues.filter((t) => t.project === project.key);
  const left = own.filter((t) => t.status === 'todo' || t.status === 'doing').length;
  const scope = left + own.filter((t) => doneSince(t, goal.set)).length;
  const daysLeft = daysBetween(day, goal.target);
  const total = daysBetween(goal.set, goal.target);
  const expected = total > 0 ? Math.ceil((scope * daysLeft) / total) : 0;
  const state: TargetState = !scope ? 'noscope' : !left ? 'done' : daysLeft < 0 ? 'overdue' : left > expected ? 'behind' : 'ontrack';
  const urgency = state === 'overdue' || state === 'behind' ? 0 : 2;
  return { project: project.key, urgency, form: 'target', date: goal.target, state, scope, left, daysLeft };
}

/** Compact progress for the status line: `JOB 3/5 ✓`, `JOB 6/10 applied`, `PORT 6 left ▲10d`. */
export function goalLabel(g: GoalProgress): string {
  const met = (m: boolean) => (m ? ' ✓' : '');
  if (g.form === 'habit') return `${g.project} ${g.done}/${g.of}${met(g.metToday)}`;
  if (g.form === 'quantity') return `${g.project} ${g.done}/${g.of} ${g.kind}${met(g.metToday)}`;
  if (g.state === 'noscope') return `${g.project} no scope`;
  if (g.state === 'done') return `${g.project} done ✓`;
  if (g.state === 'overdue') return `${g.project} ${g.left} left, overdue ${-g.daysLeft}d`;
  const due = g.daysLeft ? `▲${g.daysLeft}d` : '▲today';
  return `${g.project} ${g.left} left ${due}${g.state === 'behind' ? ', behind' : ''}`;
}

/** The goal itself, for listings: `5 days/wk`, `10 applied/wk`, `by 2026-10-19`. */
export function goalSpec(goal: Goal): string {
  if ('habit' in goal) return `${goal.habit} days/wk`;
  if ('quantity' in goal) return `${goal.quantity} ${goal.kind}/wk`;
  return `by ${goal.target}`;
}
