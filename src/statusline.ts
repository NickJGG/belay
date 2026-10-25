/** Belay's line in Claude Code's status line: the project's `doing` issue, or the next ready one. */
import { DEFAULT_PORT } from './config.ts';
import { clip, plural } from './digest.ts';
import { highFirst, indexIssues, isReady, openBlockers, recentFirst } from './query.ts';
import type { Issue, Project } from './store.ts';

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

/** An OSC 8 hyperlink to the issue's dashboard page; Ctrl+click opens it while `belay serve` runs. */
const link = (id: string, text: string) =>
  `\x1b]8;;http://127.0.0.1:${DEFAULT_PORT}/i/${encodeURIComponent(id)}\x07${text}\x1b]8;;\x07`;

/** `[done]`, linking `belay://done/<id>`: `scripts/belay-url.vbs`, registered as that scheme's handler, marks it done. */
const doneLink = (id: string) => dim(`\x1b]8;;belay://done/${encodeURIComponent(id)}\x07[done]\x1b]8;;\x07`);

/** Empty when the project has nothing doing or ready. */
export function statusLine(project: Project, issues: Issue[]): string {
  const byId = indexIssues(issues);
  const own = issues.filter((t) => t.project === project.key);
  const doing = own.filter((t) => t.status === 'doing').sort(recentFirst);
  const [first] = doing;
  if (first) {
    const more = doing.length > 1 ? ` ${dim(`+${doing.length - 1}`)}` : '';
    const blocked = openBlockers(first, byId).length ? ' ⛔' : '';
    return `${bold(`▶ ${link(first.id, first.id)}`)} ${clip(first.title, 50)} ${doneLink(first.id)}${more}${blocked}`;
  }
  const [next] = own.filter((t) => isReady(t, byId)).sort(highFirst);
  return next ? dim(`next: ${link(next.id, next.id)} ${clip(next.title, 50)}`) : '';
}

/** Appends `⚠ N bad files` when a lenient load skipped some. */
export function withBad(line: string, bad: number): string {
  return [line, bad ? `⚠ ${plural(bad, 'bad file')}` : ''].filter(Boolean).join(' │ ');
}
