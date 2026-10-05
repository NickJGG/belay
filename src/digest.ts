/** The SessionStart digest: a few lines of re-entry context when a session opens inside a registered project. */
import { goalLabel, goalOf, type GoalProgress } from './goals.ts';
import { grillForProject, projectTerms, type GrillSession } from './grill.ts';
import { localStamp, type Session } from './history.ts';
import type { DatedEntry } from './logs.ts';
import { highFirst, indexIssues, isReady, oldestFirst, type IssueIndex } from './query.ts';
import type { Project, Issue } from './store.ts';
import { addDays, workDayOf } from './workday.ts';

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The project's grill sessions that no issue links to yet. */
export function unlinkedGrill(project: Project, issues: Issue[], grill: GrillSession[]) {
  const linked = new Set(issues.map((t) => t.grill));
  return grillForProject(grill.filter((g) => !linked.has(g.slug)), project);
}

export interface DigestGoals {
  /** The current work day. */
  day: string;
  /** Every goal that counts (`goalsProgress`). */
  progress: GoalProgress[];
  /** The digest project's moved days. */
  moved: Set<string>;
  /** Log entries reaching back far enough to find the project's latest one. */
  logs: DatedEntry[];
}

const QUIET_DAYS = 2;

/** The project's latest comment or log entry. */
function lastNote(project: Project, issues: Issue[], logs: DatedEntry[]): { at: string; text: string } | undefined {
  const notes = [
    ...issues.filter((t) => t.project === project.key).flatMap((t) => t.comments),
    ...logs.filter((e) => e.project === project.key),
  ];
  return notes.reduce<{ at: string; text: string } | undefined>((a, b) => (!a || b.at > a.at ? b : a), undefined);
}

function goalDigest(project: Project, issues: Issue[], byId: IssueIndex, g: DigestGoals): string[] {
  const out: string[] = [];
  const quietSince = addDays(g.day, 1 - QUIET_DAYS);
  if (goalOf(project) && ![...g.moved].some((d) => d >= quietSince && d <= g.day)) {
    const last = lastNote(project, issues, g.logs);
    if (last) out.push(`last: ${workDayOf(last.at)} ${clip(last.text.replace(/\s+/g, ' ').trim(), 60)}`);
  }
  const others = g.progress
    .filter((p) => p.project !== project.key && p.urgency < 2)
    .map((p) => {
      const [nextUp] = issues.filter((t) => t.project === p.project && isReady(t, byId)).sort(highFirst);
      return `${goalLabel(p)}${nextUp ? ` — next: ${nextUp.id}` : ''}`;
    });
  if (others.length) out.push(`goals: ${others.join('; ')}`);
  return out;
}

export function digestLines(project: Project, issues: Issue[], sessions: Session[], grill: GrillSession[], goals?: DigestGoals): string[] {
  const byId = indexIssues(issues);
  const own = issues.filter((t) => t.project === project.key);
  const label = (t: Issue) => `${t.id} ${clip(t.title, 60)}`;
  const doing = own.filter((t) => t.status === 'doing').sort(oldestFirst);
  const ready = own.filter((t) => isReady(t, byId)).sort(highFirst);
  const ideas = own.filter((t) => t.status === 'idea').length;

  const tags = [project.focus ? 'focus' : '', project.status !== 'active' ? project.status : ''].filter(Boolean);
  const out = [`belay: ${project.key} — ${project.name}${tags.length ? ` (${tags.join(', ')})` : ''}`];
  if (doing.length) out.push(`doing: ${doing.map(label).join('; ')}`);
  const more = ready.length > 3 ? '; …' : '';
  const ideaNote = ideas ? ` (${plural(ideas, 'idea')})` : '';
  out.push(ready.length ? `ready ${ready.length}${ideaNote}: ${ready.slice(0, 3).map(label).join('; ')}${more}` : `ready: none${ideaNote}`);
  if (goals) out.push(...goalDigest(project, issues, byId, goals));
  if (sessions.length) {
    const recent = sessions.map((s) => {
      const commits = s.commits?.length ? ` (${plural(s.commits.length, 'commit')})` : '';
      return `${localStamp(s.end).date.slice(5)} ${clip(s.title, 50)}${commits}`;
    });
    out.push(`recent: ${recent.join(' · ')}`);
  }
  const { tagged, matched } = unlinkedGrill(project, issues, grill);
  const parts: string[] = [];
  if (tagged.length) {
    const open = tagged.filter((g) => g.status === 'in-progress').sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
    const slugs = open.slice(0, 2).map((g) => g.slug).join(', ') + (open.length > 2 ? ', …' : '');
    parts.push(`${plural(tagged.length, 'session')} tagged${open.length ? ` (in progress: ${slugs})` : ''}`);
  }
  if (matched.length) {
    parts.push(`${plural(matched.length, 'old session')} ${matched.length === 1 ? 'matches' : 'match'} ${projectTerms(project).join('/')}`);
  }
  if (parts.length) out.push(`grill: ${parts.join(' · ')} (belay search <word>)`);
  return out;
}
