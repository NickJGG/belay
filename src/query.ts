import { resolve } from 'node:path';
import { SOURCES, ISSUE_STATUSES, compareIds, type Project, type Source, type Issue, type IssueStatus } from './store.ts';
import { daysBetween, updatedDay } from './workday.ts';

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
  /** The work day of the newest `updated` among the project's issues. */
  lastTouched?: string;
}

export function projectCounts(project: Project, issues: Issue[], byId: IssueIndex): ProjectCounts {
  const c: ProjectCounts = { doing: 0, ready: 0, blocked: 0, ideas: 0 };
  let latest: Issue | undefined;
  for (const t of issues) {
    if (t.project !== project.key) continue;
    if (t.status === 'doing') c.doing++;
    else if (t.status === 'idea') c.ideas++;
    else if (t.status === 'todo' && isReady(t, byId)) c.ready++;
    else if (t.status === 'todo') c.blocked++;
    if (!latest || t.updated > latest.updated) latest = t;
  }
  if (latest) c.lastTouched = updatedDay(latest);
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

/**
 * A project's issues by board column, narrowed by `filter`. Without `sort`, high priority comes first within
 * each column; with it, every column is sorted by it alone. `today` is a work day.
 */
export function projectBoard(key: string, issues: Issue[], opts: { today: string; older?: boolean; filter?: IssueFilter; sort?: IssueSort }): Board {
  const byId = indexIssues(issues);
  const mine = issues.filter((t) => t.project === key);
  const own = opts.filter ? filterIssues(mine, opts.filter, byId) : mine;
  const order = opts.sort ? issueComparator(opts.sort) : highFirst;
  const of = (s: Issue['status']) => own.filter((t) => t.status === s).sort(order);
  const todo = of('todo');
  const done = opts.sort ? of('done') : of('done').sort(recentFirst);
  const recent = done.filter((t) => daysBetween(updatedDay(t), opts.today) <= DONE_WINDOW_DAYS);
  return {
    idea: of('idea'),
    todo: opts.sort ? todo : [...todo.filter((t) => isReady(t, byId)), ...todo.filter((t) => !isReady(t, byId))],
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
  /** `ready`: todo issues with no open blockers. `blocked`: issues of any status with an open blocker. */
  readiness?: 'ready' | 'blocked';
  priority?: 'high';
  source?: Source;
}

const OPEN_STATUSES: readonly IssueStatus[] = ['idea', 'todo', 'doing'];

/**
 * Reads a filter from URL query values. Unknown values are dropped rather than rejected, so a
 * hand-typed or stale URL still renders. `status` is a comma list or `all`; it defaults to `defaultStatuses`.
 * `ready` is `1` (ready) or `blocked`.
 */
export function parseIssueFilter(q: Record<string, string | undefined>, defaultStatuses: readonly IssueStatus[] = OPEN_STATUSES): IssueFilter {
  const statuses =
    q.status === 'all'
      ? ISSUE_STATUSES
      : (q.status ?? '').split(',').filter((s): s is IssueStatus => (ISSUE_STATUSES as readonly string[]).includes(s));
  return {
    statuses: statuses.length ? statuses : defaultStatuses,
    project: q.project?.toUpperCase() || undefined,
    readiness: q.ready === '1' ? 'ready' : q.ready === 'blocked' ? 'blocked' : undefined,
    priority: q.priority === 'high' ? 'high' : undefined,
    source: (SOURCES as readonly string[]).includes(q.source ?? '') ? (q.source as Source) : undefined,
  };
}

export function filterIssues(issues: Issue[], f: IssueFilter, byId: IssueIndex = indexIssues(issues)): Issue[] {
  return issues.filter(
    (t) =>
      f.statuses.includes(t.status) &&
      (!f.project || t.project === f.project) &&
      (f.readiness !== 'ready' || isReady(t, byId)) &&
      (f.readiness !== 'blocked' || openBlockers(t, byId).length > 0) &&
      (!f.priority || t.priority === f.priority) &&
      (!f.source || t.source === f.source),
  );
}

export const SORT_FIELDS = ['id', 'title', 'created', 'updated'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export interface IssueSort {
  field: SortField;
  desc: boolean;
}

/** The direction a field starts in: newest first for `updated`, ascending for the rest. */
export const naturalDesc = (field: SortField) => field === 'updated';

/** Reads `sort` and `dir` (`asc`|`desc`) from URL query values; a missing `dir` means the field's natural direction. */
export function parseIssueSort(q: Record<string, string | undefined>): IssueSort | undefined {
  const field = SORT_FIELDS.find((f) => f === q.sort);
  if (!field) return undefined;
  return { field, desc: q.dir === 'desc' ? true : q.dir === 'asc' ? false : naturalDesc(field) };
}

export function issueComparator(sort: IssueSort): (a: Issue, b: Issue) => number {
  const by: (a: Issue, b: Issue) => number = {
    id: () => 0,
    title: (a: Issue, b: Issue) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    created: (a: Issue, b: Issue) => a.created.localeCompare(b.created),
    updated: (a: Issue, b: Issue) => a.updated.localeCompare(b.updated),
  }[sort.field];
  const sign = sort.desc ? -1 : 1;
  return (a, b) => sign * (by(a, b) || compareIds(a.id, b.id));
}
