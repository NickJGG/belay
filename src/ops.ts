/**
 * Validated write operations shared by the CLI and the dashboard server. Each one takes a fresh `Ctx`,
 * so the file it saves was read just before, and a concurrent edit by Claude isn't clobbered.
 */
import { createHash } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { dataDir } from './config.ts';
import { suggestKey } from './projectkey.ts';
import { indexTasks, openBlockers } from './query.ts';
import { reorder, type MoveTarget } from './sidebar.ts';
import {
  PROJECT_STATUSES,
  SOURCES,
  TASK_STATUSES,
  canon,
  createTask,
  deleteTaskFile,
  loadOrder,
  loadProjects,
  loadTasks,
  normalizeStoredPath,
  parseId,
  projectFile,
  saveOrder,
  saveProject,
  saveTask,
  sortByOrder,
  today,
  validateKey,
  type Project,
  type Task,
  type TaskStatus,
} from './store.ts';

export function oneOf<T extends string>(value: string, allowed: readonly T[], what: string): T {
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`${what} must be one of ${allowed.join('|')} (got '${value}')`);
}

export function idList(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((v) => v.split(',')).map((s) => s.trim()).filter(Boolean);
}

export function appendNote(body: string, note: string): string {
  return `${body.trim()}\n- ${today()}: ${note.trim()}`.trim();
}

export class Ctx {
  readonly dir: string;
  /** As stored in `order.yaml`; may be partial or hold stale keys. */
  readonly order: string[];
  /** Sorted by `order` (see `sortByOrder`). */
  readonly projects: Project[];
  readonly tasks: Task[];
  readonly byId: Map<string, Task>;

  constructor(dir = dataDir()) {
    this.dir = dir;
    this.order = loadOrder(dir);
    this.projects = sortByOrder(loadProjects(dir), this.order);
    this.tasks = loadTasks(dir);
    this.byId = indexTasks(this.tasks);
  }

  project(key: string): Project {
    const p = this.projects.find((x) => x.key === canon(key));
    if (!p) throw new Error(`no project '${key}' (see 'tracker project list')`);
    return p;
  }

  task(id: string): Task {
    const t = this.byId.get(canon(id));
    if (!t) throw new Error(`no task '${id}'`);
    return t;
  }

  /** Returns the blockers in their stored form. */
  checkBlockers(id: string | undefined, blockers: string[]): string[] {
    return blockers.map((b) => {
      const t = this.task(b);
      if (t.id === id) throw new Error(`${id} cannot block itself`);
      return t.id;
    });
  }
}

export function setStatus(ctx: Ctx, id: string, value: string): { before: TaskStatus; task: Task; open: Task[] } {
  const current = ctx.task(id);
  const status = oneOf(value, TASK_STATUSES, 'status');
  const task = { ...current, status, updated: today() };
  saveTask(ctx.dir, task);
  return { before: current.status, task, open: openBlockers(current, ctx.byId) };
}

export interface NewTask {
  title: string;
  project: string;
  status?: string;
  blockers?: string[];
  priority?: string;
  source?: string;
  grill?: string;
  plan?: string;
  note?: string;
}

export function addTask(ctx: Ctx, t: NewTask): Task {
  const title = t.title.trim();
  if (!title) throw new Error('title is empty');
  const project = ctx.project(t.project);
  const blockers = ctx.checkBlockers(undefined, t.blockers ?? []);
  const date = today();
  return createTask(ctx.dir, {
    title,
    project: project.key,
    status: oneOf(t.status ?? 'todo', ['idea', 'todo'] as const, 'status'),
    blocked_by: blockers,
    priority: t.priority ? oneOf(t.priority, ['high'] as const, 'priority') : undefined,
    source: oneOf(t.source ?? 'user', SOURCES, 'source'),
    grill: t.grill,
    plan: t.plan,
    created: date,
    updated: date,
    body: t.note ? appendNote('', t.note) : '',
  });
}

export function setPriority(ctx: Ctx, id: string, high: boolean): Task {
  const task = { ...ctx.task(id), priority: high ? ('high' as const) : undefined, updated: today() };
  saveTask(ctx.dir, task);
  return task;
}

export interface TaskPatch {
  title?: string;
  blockers?: string[];
  /** `high` or `none`. */
  priority?: string;
  /** Empty clears. */
  grill?: string;
  /** Empty clears. */
  plan?: string;
  note?: string;
  /** Replaces the body; `note` is appended after it. */
  body?: string;
}

export function editTask(ctx: Ctx, id: string, patch: TaskPatch): Task {
  const task = { ...ctx.task(id) };
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new Error('title is empty');
    task.title = patch.title.trim();
  }
  if (patch.blockers !== undefined) {
    task.blocked_by = ctx.checkBlockers(task.id, patch.blockers);
  }
  if (patch.priority !== undefined) {
    task.priority = oneOf(patch.priority, ['high', 'none'] as const, 'priority') === 'high' ? 'high' : undefined;
  }
  if (patch.grill !== undefined) task.grill = patch.grill || undefined;
  if (patch.plan !== undefined) task.plan = patch.plan || undefined;
  if (patch.body !== undefined) task.body = patch.body.trim();
  if (patch.note !== undefined) task.body = appendNote(task.body, patch.note);
  task.updated = today();
  saveTask(ctx.dir, task);
  return task;
}

export function bodyHash(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

/** The body changed on disk since the editor loaded it. */
export class ConflictError extends Error {
  readonly current: string;

  constructor(id: string, current: string) {
    super(`${id} changed on disk since it was loaded`);
    this.name = 'ConflictError';
    this.current = current;
  }
}

/** With `expectedHash`, refuses to overwrite a body that no longer hashes to it. */
export function replaceBody(ctx: Ctx, id: string, body: string, expectedHash?: string): Task {
  const current = ctx.task(id).body;
  if (expectedHash !== undefined && expectedHash !== bodyHash(current)) throw new ConflictError(id, current);
  return editTask(ctx, id, { body });
}

/**
 * Strips `id` from every dependent's `blocked_by` (with a note) before removing the file, so a
 * crash midway leaves an orphaned task rather than a dangling reference. Returns the dependents.
 */
export function deleteTask(ctx: Ctx, typed: string): Task[] {
  const { id } = ctx.task(typed);
  const dependents = ctx.tasks
    .filter((t) => t.blocked_by.includes(id))
    .map((t) => ({
      ...t,
      blocked_by: t.blocked_by.filter((b) => b !== id),
      body: appendNote(t.body, `blocker ${id} deleted`),
      updated: today(),
    }));
  for (const t of dependents) saveTask(ctx.dir, t);
  deleteTaskFile(ctx.dir, id);
  return dependents;
}

export interface ProjectPatch {
  name?: string;
  /** Empty clears. */
  group?: string;
  status?: string;
  focus?: boolean;
}

export function editProject(ctx: Ctx, key: string, patch: ProjectPatch): Project {
  const p = { ...ctx.project(key) };
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new Error('name is empty');
    p.name = patch.name.trim();
  }
  if (patch.group !== undefined) p.group = patch.group.trim() || undefined;
  if (patch.status !== undefined) p.status = oneOf(patch.status, PROJECT_STATUSES, 'status');
  if (patch.focus !== undefined) p.focus = patch.focus;
  saveProject(ctx.dir, p);
  return p;
}

export type { MoveTarget };

/** Saves the full order, so projects that were unlisted get pinned where they currently sort. */
export function moveProject(ctx: Ctx, key: string, where: MoveTarget): string[] {
  const moved = ctx.project(key).key;
  const anchor = typeof where === 'string' ? where : 'before' in where ? { before: ctx.project(where.before).key } : { after: ctx.project(where.after).key };
  const keys = reorder(ctx.projects.map((p) => p.key), moved, anchor);
  saveOrder(ctx.dir, keys);
  return keys;
}

export function setFocus(ctx: Ctx, key: string, focus: boolean): Project {
  return editProject(ctx, key, { focus });
}

export interface NewProject {
  /** Derived from `name` when absent. */
  key?: string;
  name: string;
  paths: string[];
  group?: string;
  focus?: boolean;
}

export function addProject(ctx: Ctx, n: NewProject): { project: Project; missing: string[] } {
  const name = n.name.trim();
  if (!name) throw new Error('name is empty');
  if (!n.paths.length) throw new Error('at least one path is required');
  const key = n.key ? canon(n.key) : suggestKey(name, ctx.projects.map((p) => p.key));
  validateKey(key);
  if (ctx.projects.some((p) => p.key === key) || existsSync(projectFile(ctx.dir, key))) throw new Error(`project '${key}' already exists`);
  const paths = n.paths.map(normalizeStoredPath);
  const project: Project = { key, name, paths, status: 'active', focus: n.focus ?? false, group: n.group?.trim() || undefined, body: '' };
  saveProject(ctx.dir, project);
  return { project, missing: paths.filter((p) => !existsSync(p)) };
}

/**
 * Renames a project's key and its tasks' IDs (numbers kept), rewriting `blocked_by` everywhere.
 * New files are written before old ones are removed, so a crash leaves duplicates, never lost tasks.
 */
export function rekeyProject(ctx: Ctx, from: string, to: string): { project: Project; renamed: Map<string, string> } {
  const old = ctx.project(from);
  const key = canon(to);
  validateKey(key);
  if (ctx.projects.some((p) => p.key === key) || existsSync(projectFile(ctx.dir, key))) throw new Error(`project '${key}' already exists`);
  const own = ctx.tasks.filter((t) => t.project === old.key);
  const renamed = new Map(own.map((t) => [t.id, `${key}-${parseId(t.id)!.n}`]));
  const remap = (ids: string[]) => ids.map((b) => renamed.get(b) ?? b);

  const project = { ...old, key };
  saveProject(ctx.dir, project);
  for (const t of own) saveTask(ctx.dir, { ...t, id: renamed.get(t.id)!, project: key, blocked_by: remap(t.blocked_by) });
  for (const t of ctx.tasks) {
    if (t.project !== old.key && t.blocked_by.some((b) => renamed.has(b))) saveTask(ctx.dir, { ...t, blocked_by: remap(t.blocked_by) });
  }
  for (const t of own) deleteTaskFile(ctx.dir, t.id);
  unlinkSync(projectFile(ctx.dir, old.key));
  if (ctx.order.includes(old.key)) saveOrder(ctx.dir, ctx.order.map((k) => (k === old.key ? key : k)));
  return { project, renamed };
}
