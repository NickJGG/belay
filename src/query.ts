import { resolve } from 'node:path';
import { SOURCES, TASK_STATUSES, compareIds, type Project, type Source, type Task, type TaskStatus } from './store.ts';

export type TaskIndex = Map<string, Task>;

export function indexTasks(tasks: Task[]): TaskIndex {
  return new Map(tasks.map((t) => [t.id, t]));
}

/** Blockers that are neither done nor dropped. A blocker ID with no task file doesn't block. */
export function openBlockers(task: Task, byId: TaskIndex): Task[] {
  return task.blocked_by
    .map((id) => byId.get(id))
    .filter((b): b is Task => !!b && b.status !== 'done' && b.status !== 'dropped');
}

export function isReady(task: Task, byId: TaskIndex): boolean {
  return task.status === 'todo' && openBlockers(task, byId).length === 0;
}

export interface ProjectCounts {
  doing: number;
  ready: number;
  /** `todo` tasks with open blockers. */
  blocked: number;
  ideas: number;
  /** Newest `updated` among the project's tasks. */
  lastTouched?: string;
}

export function projectCounts(project: Project, tasks: Task[], byId: TaskIndex): ProjectCounts {
  const c: ProjectCounts = { doing: 0, ready: 0, blocked: 0, ideas: 0 };
  for (const t of tasks) {
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
  doing: Task[];
  high: Task[];
  focus: Task[];
  /** Ready tasks from active, non-focus projects; shown only with `--all`. */
  other: Task[];
}

export const oldestFirst = (a: Task, b: Task) => a.created.localeCompare(b.created) || compareIds(a.id, b.id);

export function next(projects: Project[], tasks: Task[]): Next {
  const byId = indexTasks(tasks);
  const byKey = new Map(projects.map((p) => [p.key, p]));
  const result: Next = { doing: [], high: [], focus: [], other: [] };
  for (const t of [...tasks].sort(oldestFirst)) {
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
  return result;
}

export interface Board {
  idea: Task[];
  /** Ready first, then blocked. */
  todo: Task[];
  doing: Task[];
  /** Newest first; only the recent window unless `older` was asked for. */
  done: Task[];
  /** Done tasks hidden by the window. */
  olderDone: number;
  dropped: Task[];
}

const DONE_WINDOW_DAYS = 14;

/** A project's tasks by board column, high priority first within each. */
export function projectBoard(key: string, tasks: Task[], opts: { today: string; older?: boolean }): Board {
  const byId = indexTasks(tasks);
  const own = tasks.filter((t) => t.project === key);
  const high = (a: Task, b: Task) => Number(b.priority === 'high') - Number(a.priority === 'high') || oldestFirst(a, b);
  const of = (s: Task['status']) => own.filter((t) => t.status === s).sort(high);
  const todo = of('todo');
  const done = of('done').sort((a, b) => b.updated.localeCompare(a.updated) || oldestFirst(a, b));
  const days = (t: Task) => Math.round((Date.parse(opts.today) - Date.parse(t.updated)) / 86_400_000);
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

export interface TaskFilter {
  statuses: readonly TaskStatus[];
  project?: string;
  /** Only todo tasks with no open blockers. */
  ready?: boolean;
  priority?: 'high';
  source?: Source;
}

const OPEN_STATUSES: readonly TaskStatus[] = ['idea', 'todo', 'doing'];

/**
 * Reads a filter from URL query values. Unknown values are dropped rather than rejected, so a
 * hand-typed or stale URL still renders. `status` is a comma list or `all`; it defaults to the open ones.
 */
export function parseTaskFilter(q: Record<string, string | undefined>): TaskFilter {
  const statuses =
    q.status === 'all'
      ? TASK_STATUSES
      : (q.status ?? '').split(',').filter((s): s is TaskStatus => (TASK_STATUSES as readonly string[]).includes(s));
  return {
    statuses: statuses.length ? statuses : OPEN_STATUSES,
    project: q.project?.toUpperCase() || undefined,
    ready: q.ready === '1' || undefined,
    priority: q.priority === 'high' ? 'high' : undefined,
    source: (SOURCES as readonly string[]).includes(q.source ?? '') ? (q.source as Source) : undefined,
  };
}

export function filterTasks(tasks: Task[], f: TaskFilter, byId: TaskIndex = indexTasks(tasks)): Task[] {
  return tasks.filter(
    (t) =>
      f.statuses.includes(t.status) &&
      (!f.project || t.project === f.project) &&
      (!f.ready || isReady(t, byId)) &&
      (!f.priority || t.priority === f.priority) &&
      (!f.source || t.source === f.source),
  );
}
