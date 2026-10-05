import { resolve } from 'node:path';
import { SOURCES, ISSUE_STATUSES, compareIds, type Project, type Source, type Issue, type IssueStatus } from './store.ts';

export type IssueIndex = Map<string, Issue>;

export function indexIssues(issues: Issue[]): IssueIndex {
  return new Map(issues.map((t) => [t.id, t]));
}

/** Blockers that are neither done nor dropped. A blocker ID with no issue file doesn't block. */
export function openBlockers(issue: Issue, byId: IssueIndex): Issue[] {
  return issue.blocked_by
    .map((id) => byId.get(id))
    .filter((b): b is Issue => !!b && b.status !== 'done' && b.status !== 'dropped');
}

export function isReady(issue: Issue, byId: IssueIndex): boolean {
  return issue.status === 'todo' && openBlockers(issue, byId).length === 0;
}

export interface ProjectCounts {
  doing: number;
  ready: number;
  /** `todo` issues with open blockers. */
  blocked: number;
  ideas: number;
  /** Newest `updated` among the project's issues. */
  lastTouched?: string;
}

export function projectCounts(project: Project, issues: Issue[], byId: IssueIndex): ProjectCounts {
  const c: ProjectCounts = { doing: 0, ready: 0, blocked: 0, ideas: 0 };
  for (const t of issues) {
    if (t.project !== project.key) continue;
    if (t.status === 'doing') c.doing++;
    else if (t.status === 'idea') c.ideas++;
    else if (t.status === 'todo' && isReady(t, byId)) c.ready++;
    else if (t.status === 'todo') c.blocked++;
    if (!c.lastTouched || t.updated > c.lastTouched) c.lastTouched = t.updated;
  }
  return c;
}

export interface Next {
  doing: Issue[];
  high: Issue[];
  focus: Issue[];
  /** Ready issues from active, non-focus projects; shown only with `--all`. */
  other: Issue[];
}

export const oldestFirst = (a: Issue, b: Issue) => a.created.localeCompare(b.created) || compareIds(a.id, b.id);

export const recentFirst = (a: Issue, b: Issue) => b.updated.localeCompare(a.updated) || oldestFirst(a, b);

export const highFirst = (a: Issue, b: Issue) => Number(b.priority === 'high') - Number(a.priority === 'high') || oldestFirst(a, b);

/** `urgency` ranks focus projects (see `goals.ts`, lower first); projects missing from it rank last. */
export function next(projects: Project[], issues: Issue[], urgency?: ReadonlyMap<string, number>): Next {
  const byId = indexIssues(issues);
  const byKey = new Map(projects.map((p) => [p.key, p]));
  const result: Next = { doing: [], high: [], focus: [], other: [] };
  for (const t of [...issues].sort(oldestFirst)) {
    if (t.status === 'doing') {
      result.doing.push(t);
      continue;
    }
    const p = byKey.get(t.project);
    if (p?.status !== 'active' || !isReady(t, byId)) continue;
    if (t.priority === 'high') result.high.push(t);
    else if (p.focus) result.focus.push(t);
    else result.other.push(t);
  }
  if (urgency) result.focus.sort((a, b) => (urgency.get(a.project) ?? 2) - (urgency.get(b.project) ?? 2));
  return result;
}

export interface Board {
  idea: Issue[];
  /** Ready first, then blocked. */
  todo: Issue[];
  doing: Issue[];
  /** Newest first; only the recent window unless `older` was asked for. */
  done: Issue[];
  /** Done issues hidden by the window. */
  olderDone: number;
  dropped: Issue[];
}

const DONE_WINDOW_DAYS = 14;

/** A project's issues by board column, high priority first within each. */
export function projectBoard(key: string, issues: Issue[], opts: { today: string; older?: boolean }): Board {
  const byId = indexIssues(issues);
  const own = issues.filter((t) => t.project === key);
  const of = (s: Issue['status']) => own.filter((t) => t.status === s).sort(highFirst);
  const todo = of('todo');
  const done = of('done').sort(recentFirst);
  const days = (t: Issue) => Math.round((Date.parse(opts.today) - Date.parse(t.updated)) / 86_400_000);
  const recent = done.filter((t) => days(t) <= DONE_WINDOW_DAYS);
  return {
    idea: of('idea'),
    todo: [...todo.filter((t) => isReady(t, byId)), ...todo.filter((t) => !isReady(t, byId))],
    doing: of('doing'),
    done: opts.older ? done : recent,
    olderDone: done.length - recent.length,
    dropped: of('dropped'),
  };
}

function comparablePath(p: string, platform: NodeJS.Platform): string {
  if (platform !== 'win32') return resolve(p).replace(/\/+$/, '');
  // Git Bash reports cwds as /c/Users/...
  const drive = p.replace(/^\/([a-z])(?=\/|$)/i, '$1:/');
  return resolve(drive).replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
}

/** The project whose path is the longest prefix of `cwd`. */
export function projectForCwd(projects: Project[], cwd: string, platform = process.platform): Project | undefined {
  const here = comparablePath(cwd, platform);
  let best: { project: Project; len: number } | undefined;
  for (const project of projects) {
    for (const raw of project.paths) {
      const p = comparablePath(raw, platform);
      if ((here === p || here.startsWith(`${p}/`)) && p.length > (best?.len ?? -1)) best = { project, len: p.length };
    }
  }
  return best?.project;
}

export interface IssueFilter {
  statuses: readonly IssueStatus[];
  project?: string;
  /** Only todo issues with no open blockers. */
  ready?: boolean;
  priority?: 'high';
  source?: Source;
}

const OPEN_STATUSES: readonly IssueStatus[] = ['idea', 'todo', 'doing'];

/**
 * Reads a filter from URL query values. Unknown values are dropped rather than rejected, so a
 * hand-typed or stale URL still renders. `status` is a comma list or `all`; it defaults to the open ones.
 */
export function parseIssueFilter(q: Record<string, string | undefined>): IssueFilter {
  const statuses =
    q.status === 'all'
      ? ISSUE_STATUSES
      : (q.status ?? '').split(',').filter((s): s is IssueStatus => (ISSUE_STATUSES as readonly string[]).includes(s));
  return {
    statuses: statuses.length ? statuses : OPEN_STATUSES,
    project: q.project?.toUpperCase() || undefined,
    ready: q.ready === '1' || undefined,
    priority: q.priority === 'high' ? 'high' : undefined,
    source: (SOURCES as readonly string[]).includes(q.source ?? '') ? (q.source as Source) : undefined,
  };
}

export function filterIssues(issues: Issue[], f: IssueFilter, byId: IssueIndex = indexIssues(issues)): Issue[] {
  return issues.filter(
    (t) =>
      f.statuses.includes(t.status) &&
      (!f.project || t.project === f.project) &&
      (!f.ready || isReady(t, byId)) &&
      (!f.priority || t.priority === f.priority) &&
      (!f.source || t.source === f.source),
  );
}
