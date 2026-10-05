/**
 * Validated write operations shared by the CLI and the dashboard server. Each one takes a fresh `Ctx`,
 * so the file it saves was read just before, and a concurrent edit by Claude isn't clobbered.
 */
import { createHash } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { dataDir } from './config.ts';
import { suggestKey } from './projectkey.ts';
import { indexIssues, openBlockers } from './query.ts';
import { reorder, type MoveTarget } from './sidebar.ts';
import {
  PROJECT_STATUSES,
  SOURCES,
  ISSUE_STATUSES,
  canon,
  createIssue,
  deleteIssueFile,
  loadOrder,
  loadProjects,
  loadIssues,
  normalizeStoredPath,
  parseId,
  projectFile,
  saveOrder,
  saveProject,
  saveIssue,
  sortByOrder,
  now,
  today,
  validateKey,
  type Comment,
  type Project,
  type Issue,
  type IssueStatus,
} from './store.ts';

export function oneOf<T extends string>(value: string, allowed: readonly T[], what: string): T {
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`${what} must be one of ${allowed.join('|')} (got '${value}')`);
}

export function idList(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((v) => v.split(',')).map((s) => s.trim()).filter(Boolean);
}

export class Ctx {
  readonly dir: string;
  /** As stored in `order.yaml`; may be partial or hold stale keys. */
  readonly order: string[];
  /** Sorted by `order` (see `sortByOrder`). */
  readonly projects: Project[];
  readonly issues: Issue[];
  readonly byId: Map<string, Issue>;

  constructor(dir = dataDir()) {
    this.dir = dir;
    this.order = loadOrder(dir);
    this.projects = sortByOrder(loadProjects(dir), this.order);
    this.issues = loadIssues(dir);
    this.byId = indexIssues(this.issues);
  }

  project(key: string): Project {
    const p = this.projects.find((x) => x.key === canon(key));
    if (!p) throw new Error(`no project '${key}' (see 'tracker project list')`);
    return p;
  }

  issue(id: string): Issue {
    const t = this.byId.get(canon(id));
    if (!t) throw new Error(`no issue '${id}'`);
    return t;
  }

  /** Returns the blockers in their stored form. */
  checkBlockers(id: string | undefined, blockers: string[]): string[] {
    return blockers.map((b) => {
      const t = this.issue(b);
      if (t.id === id) throw new Error(`${id} cannot block itself`);
      return t.id;
    });
  }
}

export function setStatus(ctx: Ctx, id: string, value: string): { before: IssueStatus; issue: Issue; open: Issue[] } {
  const current = ctx.issue(id);
  const status = oneOf(value, ISSUE_STATUSES, 'status');
  const issue = { ...current, status, updated: today() };
  saveIssue(ctx.dir, issue);
  return { before: current.status, issue, open: openBlockers(current, ctx.byId) };
}

export interface NewIssue {
  title: string;
  project: string;
  status?: string;
  blockers?: string[];
  priority?: string;
  source?: string;
  grill?: string;
  plan?: string;
  body?: string;
}

export function addIssue(ctx: Ctx, t: NewIssue): Issue {
  const title = t.title.trim();
  if (!title) throw new Error('title is empty');
  const project = ctx.project(t.project);
  const blockers = ctx.checkBlockers(undefined, t.blockers ?? []);
  const date = today();
  return createIssue(ctx.dir, {
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
    comments: [],
    body: (t.body ?? '').trim(),
  });
}

export function setPriority(ctx: Ctx, id: string, high: boolean): Issue {
  const issue = { ...ctx.issue(id), priority: high ? ('high' as const) : undefined, updated: today() };
  saveIssue(ctx.dir, issue);
  return issue;
}

export interface IssuePatch {
  title?: string;
  blockers?: string[];
  /** `high` or `none`. */
  priority?: string;
  /** Empty clears. */
  grill?: string;
  /** Empty clears. */
  plan?: string;
  /** Replaces the body. */
  body?: string;
}

export function editIssue(ctx: Ctx, id: string, patch: IssuePatch): Issue {
  const issue = { ...ctx.issue(id) };
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new Error('title is empty');
    issue.title = patch.title.trim();
  }
  if (patch.blockers !== undefined) {
    issue.blocked_by = ctx.checkBlockers(issue.id, patch.blockers);
  }
  if (patch.priority !== undefined) {
    issue.priority = oneOf(patch.priority, ['high', 'none'] as const, 'priority') === 'high' ? 'high' : undefined;
  }
  if (patch.grill !== undefined) issue.grill = patch.grill || undefined;
  if (patch.plan !== undefined) issue.plan = patch.plan || undefined;
  if (patch.body !== undefined) issue.body = patch.body.trim();
  issue.updated = today();
  saveIssue(ctx.dir, issue);
  return issue;
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
export function replaceBody(ctx: Ctx, id: string, body: string, expectedHash?: string): Issue {
  const current = ctx.issue(id).body;
  if (expectedHash !== undefined && expectedHash !== bodyHash(current)) throw new ConflictError(id, current);
  return editIssue(ctx, id, { body });
}

/** Who a comment is credited to. */
export type Author = Pick<Comment, 'by' | 'session'>;

/** The CLI's author: `claude` inside Claude Code (`CLAUDECODE`), with its session, else `user`. `as` overrides. */
export function commentAuthor(env: Record<string, string | undefined>, as?: string): Author {
  const by = as === undefined ? (env.CLAUDECODE ? 'claude' : 'user') : oneOf(as, SOURCES, '--as');
  const session = by === 'claude' && env.CLAUDE_CODE_SESSION_ID;
  return session ? { by, session } : { by };
}

/** LF only: a `\r` would make YAML write the text as an escaped quoted string instead of a block. */
function commentText(text: string): string {
  const trimmed = text.replaceAll('\r\n', '\n').trim();
  if (!trimmed) throw new Error('comment is empty');
  return trimmed;
}

/** Comment `#n` changed on disk since it was loaded: its `at` no longer matches. */
export class CommentConflictError extends Error {
  constructor(id: string, n: number) {
    super(`${id} #${n} changed on disk since it was loaded`);
    this.name = 'CommentConflictError';
  }
}

/** Returns the new comment's number. */
export function addComment(ctx: Ctx, id: string, text: string, author: Author): { issue: Issue; n: number } {
  const current = ctx.issue(id);
  const comment = { at: now(), ...author, text: commentText(text) };
  const issue = { ...current, comments: [...current.comments, comment], updated: today() };
  saveIssue(ctx.dir, issue);
  return { issue, n: issue.comments.length };
}

/** `n` is 1-based, as `show` numbers them. With `expectAt`, refuses when `#n` isn't the comment that was loaded. */
function commentIndex(issue: Issue, n: number, expectAt: string | undefined): number {
  if (!Number.isInteger(n) || n < 1 || n > issue.comments.length) {
    throw new Error(`${issue.id} has no comment #${n} (it has ${issue.comments.length})`);
  }
  if (expectAt !== undefined && issue.comments[n - 1].at !== expectAt) throw new CommentConflictError(issue.id, n);
  return n - 1;
}

export function editComment(ctx: Ctx, id: string, n: number, text: string, expectAt?: string): Issue {
  const current = ctx.issue(id);
  const i = commentIndex(current, n, expectAt);
  const comments = current.comments.map((c, j) => (j === i ? { ...c, text: commentText(text) } : c));
  const issue = { ...current, comments, updated: today() };
  saveIssue(ctx.dir, issue);
  return issue;
}

export function deleteComment(ctx: Ctx, id: string, n: number, expectAt?: string): Issue {
  const current = ctx.issue(id);
  const i = commentIndex(current, n, expectAt);
  const issue = { ...current, comments: current.comments.filter((_, j) => j !== i), updated: today() };
  saveIssue(ctx.dir, issue);
  return issue;
}

/**
 * Strips `id` from every dependent's `blocked_by` (with a comment by `author`) before removing the file,
 * so a crash midway leaves an orphaned issue rather than a dangling reference. Returns the dependents.
 */
export function deleteIssue(ctx: Ctx, typed: string, author: Author): Issue[] {
  const { id } = ctx.issue(typed);
  const at = now();
  const dependents = ctx.issues
    .filter((t) => t.blocked_by.includes(id))
    .map((t) => ({
      ...t,
      blocked_by: t.blocked_by.filter((b) => b !== id),
      comments: [...t.comments, { at, ...author, text: `blocker ${id} deleted` }],
      updated: today(),
    }));
  for (const t of dependents) saveIssue(ctx.dir, t);
  deleteIssueFile(ctx.dir, id);
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
 * Renames a project's key and its issues' IDs (numbers kept), rewriting `blocked_by` everywhere.
 * New files are written before old ones are removed, so a crash leaves duplicates, never lost issues.
 */
export function rekeyProject(ctx: Ctx, from: string, to: string): { project: Project; renamed: Map<string, string> } {
  const old = ctx.project(from);
  const key = canon(to);
  validateKey(key);
  if (ctx.projects.some((p) => p.key === key) || existsSync(projectFile(ctx.dir, key))) throw new Error(`project '${key}' already exists`);
  const own = ctx.issues.filter((t) => t.project === old.key);
  const renamed = new Map(own.map((t) => [t.id, `${key}-${parseId(t.id)!.n}`]));
  const remap = (ids: string[]) => ids.map((b) => renamed.get(b) ?? b);

  const project = { ...old, key };
  saveProject(ctx.dir, project);
  for (const t of own) saveIssue(ctx.dir, { ...t, id: renamed.get(t.id)!, project: key, blocked_by: remap(t.blocked_by) });
  for (const t of ctx.issues) {
    if (t.project !== old.key && t.blocked_by.some((b) => renamed.has(b))) saveIssue(ctx.dir, { ...t, blocked_by: remap(t.blocked_by) });
  }
  for (const t of own) deleteIssueFile(ctx.dir, t.id);
  unlinkSync(projectFile(ctx.dir, old.key));
  if (ctx.order.includes(old.key)) saveOrder(ctx.dir, ctx.order.map((k) => (k === old.key ? key : k)));
  return { project, renamed };
}
