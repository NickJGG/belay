import { resolve } from 'node:path';
import { compareIds, type Project, type Task } from './store.ts';

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

export interface Next {
  doing: Task[];
  high: Task[];
  focus: Task[];
  /** Ready tasks from active, non-focus projects; shown only with `--all`. */
  other: Task[];
}

export const oldestFirst =(a: Task, b: Task) => a.created.localeCompare(b.created) || compareIds(a.id, b.id);

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
