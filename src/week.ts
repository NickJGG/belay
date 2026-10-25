/** The weekly recap: per project, which days it moved and what got done, committed and logged. */
import type { DatedEntry } from './logs.ts';
import { commitDays, movedDays } from './moved.ts';
import { compareIds, type Issue, type Project } from './store.ts';
import { addDays, weekDays, workDayOf } from './workday.ts';

export interface WeekRow {
  project: string;
  /** Mon–Sun; `null` for days not yet reached. */
  moved: (boolean | null)[];
  /** Issues whose last move to done fell in the week. */
  done: string[];
  commits: number;
  /** Summed counts per kind, in the project's declared order. */
  kinds: { kind: string; count: number }[];
  /** Entries without a kind. */
  notes: number;
}

/**
 * One row per project that moved during the week starting `week`. `logs` must
 * cover the week; `commits` maps project keys to that week's commit times.
 */
export function weekSummary(
  projects: Project[],
  issues: Issue[],
  logs: DatedEntry[],
  commits: Record<string, string[]>,
  week: string,
  today: string,
): WeekRow[] {
  const days = weekDays(week);
  const end = days[6] < today ? days[6] : today;
  const inWeek = (d: string) => d >= week && d <= days[6];
  return projects.flatMap((p) => {
    const times = commits[p.key] ?? [];
    const moved = movedDays(p, issues, logs, commitDays(times));
    if (![...moved].some(inWeek)) return [];
    const own = logs.filter((e) => e.project === p.key && inWeek(e.day));
    const kinds = new Map<string, number>();
    for (const e of own) if (e.kind) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + (e.count ?? 1));
    const declared = p.kinds ?? [];
    const rank = (k: string) => (declared.includes(k) ? declared.indexOf(k) : declared.length);
    return [
      {
        project: p.key,
        moved: days.map((d) => (d > end ? null : moved.has(d))),
        done: issues
          .filter((t) => t.project === p.key && t.status === 'done')
          .filter((t) => {
            const last = t.transitions?.findLast((x) => x.to === 'done');
            return !!last && inWeek(workDayOf(last.at));
          })
          .map((t) => t.id)
          .sort(compareIds),
        commits: times.length,
        kinds: [...kinds].map(([kind, count]) => ({ kind, count })).sort((a, b) => rank(a.kind) - rank(b.kind)),
        notes: own.filter((e) => !e.kind).length,
      },
    ];
  });
}

export function weekLines(rows: WeekRow[], week: string): string[] {
  const out = [`week of ${week} – ${addDays(week, 6)}`];
  if (!rows.length) return [...out, '  nothing moved'];
  const keyW = Math.max(...rows.map((r) => r.project.length));
  for (const r of rows) {
    const dots = r.moved.map((m) => (m === null ? '·' : m ? '●' : '○')).join('');
    const logged = [...r.kinds.map((k) => `${k.kind} ${k.count}`), r.notes ? `${r.notes} note${r.notes === 1 ? '' : 's'}` : ''].filter(Boolean);
    const done = r.done.length > 3 ? `${r.done.length} done` : r.done.length ? `done ${r.done.join(', ')}` : '';
    const parts = [
      done,
      r.commits && `${r.commits} commit${r.commits === 1 ? '' : 's'}`,
      logged.length && `logged ${logged.join(', ')}`,
    ].filter(Boolean);
    out.push(`  ${r.project.padEnd(keyW)}  ${dots}${parts.length ? `  ${parts.join(' · ')}` : ''}`);
  }
  return out;
}
