/**
 * The SessionStart digest: a few lines of re-entry context when a session opens inside a registered project. Active
 * extensions' sections follow these lines.
 */
import { localStamp, type Session } from './history.ts';
import { highFirst, indexIssues, isReady, oldestFirst } from './query.ts';
import type { BadFile, Project, Issue } from './store.ts';

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface DigestOptions {
  /** Files the load skipped. */
  bad?: BadFile[];
  /** After compaction: only the header, doing, ready and bad-files lines. */
  compact?: boolean;
}

export function digestLines(
  project: Project,
  issues: Issue[],
  sessions: Session[],
  { bad = [], compact = false }: DigestOptions = {},
): string[] {
  const byId = indexIssues(issues);
  const own = issues.filter((t) => t.project === project.key);
  const label = (t: Issue) => `${t.id} ${clip(t.title, 60)}`;
  const doing = own.filter((t) => t.status === 'doing').sort(oldestFirst);
  const ready = own.filter((t) => isReady(t, byId)).sort(highFirst);
  const ideas = own.filter((t) => t.status === 'idea').length;

  const tags = [project.focus ? 'focus' : '', project.status !== 'active' ? project.status : ''].filter(Boolean);
  const out = [`belay: ${project.key} — ${project.name}${tags.length ? ` (${tags.join(', ')})` : ''}`];
  const firstThree = (list: Issue[]) => list.slice(0, 3).map(label).join('; ') + (list.length > 3 ? '; …' : '');
  if (doing.length) out.push(`doing${doing.length > 3 ? ` ${doing.length}` : ''}: ${firstThree(doing)}`);
  const ideaNote = ideas ? ` (${plural(ideas, 'idea')})` : '';
  out.push(ready.length ? `ready ${ready.length}${ideaNote}: ${firstThree(ready)}` : `ready: none${ideaNote}`);
  if (bad.length) {
    const shown = bad.slice(0, 2).map((b) => `${b.file} (${clip(b.error, 60)})`);
    out.push(`bad files: ${shown.join('; ')}${bad.length > 2 ? '; …' : ''}`);
  }
  if (compact) return out;
  if (sessions.length) {
    const recent = sessions.map((s) => {
      const commits = s.commits?.length ? ` (${plural(s.commits.length, 'commit')})` : '';
      return `${localStamp(s.end).date.slice(5)} ${clip(s.title, 50)}${commits}`;
    });
    out.push(`recent: ${recent.join(' · ')}`);
  }
  return out;
}
