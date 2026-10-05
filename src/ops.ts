/**
 * Validated write operations shared by the CLI and the dashboard server. Each one takes a fresh `Ctx`,
 * so the file it saves was read just before, and a concurrent edit by Claude isn't clobbered.
 */
import { createHash } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { dataDir } from './config.ts';
import { loadLog, loadLogs, parseLogAddress, saveLog, type DatedEntry, type LogEntry } from './logs.ts';
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
  type Goal,
  type Project,
  type Issue,
  type IssueStatus,
} from './store.ts';
import { addDays, isDay, parseDay, workDay } from './workday.ts';

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
  readonly #logs = new Map<string, DatedEntry[]>();

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

  /** Log entries on work days `from`..`to`, read on first use: most callers never need them. */
  logs(from: string, to: string): DatedEntry[] {
    const k = `${from}..${to}`;
    let entries = this.#logs.get(k);
    if (!entries) this.#logs.set(k, (entries = loadLogs(this.dir, from, to)));
    return entries;
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

const USER: Author = { by: 'user' };

export function setStatus(ctx: Ctx, id: string, value: string, author = USER): { before: IssueStatus; issue: Issue; open: Issue[] } {
  const current = ctx.issue(id);
  const status = oneOf(value, ISSUE_STATUSES, 'status');
  const transitions =
    status === current.status ? current.transitions : [...(current.transitions ?? []), { at: now(), from: current.status, to: status, ...author }];
  const issue = { ...current, status, updated: today(), ...(transitions && { transitions }) };
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

export function addIssue(ctx: Ctx, t: NewIssue, author = USER): Issue {
  const title = t.title.trim();
  if (!title) throw new Error('title is empty');
  const project = ctx.project(t.project);
  const blockers = ctx.checkBlockers(undefined, t.blockers ?? []);
  const date = today();
  const status = oneOf(t.status ?? 'todo', ['idea', 'todo'] as const, 'status');
  return createIssue(ctx.dir, {
    title,
    project: project.key,
    status,
    blocked_by: blockers,
    priority: t.priority ? oneOf(t.priority, ['high'] as const, 'priority') : undefined,
    source: oneOf(t.source ?? 'user', SOURCES, 'source'),
    grill: t.grill,
    plan: t.plan,
    created: date,
    updated: date,
    comments: [],
    transitions: [{ at: now(), to: status, ...author }],
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

/** A target's `set` is stamped by `editProject`. */
export type GoalInput = { habit: number } | { quantity: number; kind: string } | { target: string };

export interface ProjectPatch {
  name?: string;
  /** Empty clears. */
  group?: string;
  status?: string;
  focus?: boolean;
  /** Empty clears. */
  kinds?: string[];
  /** `null` clears. */
  goal?: GoalInput | null;
}

const KIND_RE = /^[a-z0-9][a-z0-9_-]*$/;

function positiveInt(n: number, what: string, max: number): number {
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`${what} must be a whole number from 1 to ${max} (got ${n})`);
  return n;
}

function kindList(kinds: string[]): string[] | undefined {
  const list = [...new Set(kinds.map((k) => k.trim().toLowerCase()).filter(Boolean))];
  for (const k of list) if (!KIND_RE.test(k)) throw new Error(`kind '${k}' must be lowercase letters, digits, - or _`);
  return list.length ? list : undefined;
}

/** A kind the project declares, or an error naming the closest one. */
function declaredKind(p: Project, kind: string): string {
  const k = kind.trim().toLowerCase();
  const kinds = p.kinds ?? [];
  if (kinds.includes(k)) return k;
  if (!kinds.length) throw new Error(`${p.key} declares no kinds ('tracker project set ${p.key} --kinds a,b')`);
  const near = closest(k, kinds);
  throw new Error(`${p.key} has no kind '${kind}'${near ? ` — did you mean '${near}'?` : ''} (kinds: ${kinds.join(', ')})`);
}

/** The nearest option by edit distance, if it's within about a third of the word. */
export function closest(word: string, options: string[]): string | undefined {
  let best: string | undefined;
  let bestD = Math.max(2, Math.ceil(word.length / 3)) + 1;
  for (const o of options) {
    const d = editDistance(word, o);
    if (d < bestD) [best, bestD] = [o, d];
  }
  return best;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** Moving an existing target's date keeps its `set`, so its scope and pace keep their start. */
function goalFor(p: Project, g: GoalInput, clock: Date): Goal {
  if ('habit' in g) return { habit: positiveInt(g.habit, 'habit days per week', 7) };
  if ('quantity' in g) return { quantity: positiveInt(g.quantity, 'quantity', 1000), kind: declaredKind(p, g.kind) };
  if (!isDay(g.target)) throw new Error(`target must be a YYYY-MM-DD date (got '${g.target}')`);
  const day = workDay(clock);
  if (g.target < day) throw new Error(`target ${g.target} is in the past`);
  return { target: g.target, set: p.goal && 'target' in p.goal ? p.goal.set : day };
}

export function editProject(ctx: Ctx, key: string, patch: ProjectPatch, clock = new Date()): Project {
  const p = { ...ctx.project(key) };
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new Error('name is empty');
    p.name = patch.name.trim();
  }
  if (patch.group !== undefined) p.group = patch.group.trim() || undefined;
  if (patch.status !== undefined) p.status = oneOf(patch.status, PROJECT_STATUSES, 'status');
  if (patch.focus !== undefined) p.focus = patch.focus;
  if (patch.kinds !== undefined) p.kinds = kindList(patch.kinds);
  if (patch.goal !== undefined) p.goal = patch.goal === null ? undefined : goalFor(p, patch.goal, clock);
  else if (patch.kinds !== undefined && p.goal && 'kind' in p.goal && !p.kinds?.includes(p.goal.kind)) {
    throw new Error(`${p.key}'s quantity goal counts '${p.goal.kind}': keep that kind or change the goal`);
  }
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

export interface NewLog {
  project: string;
  text: string;
  kind?: string;
  count?: number;
  minutes?: number;
  issue?: string;
  /** The work day it counts toward: `today`, `yesterday` or `YYYY-MM-DD`. Default today. */
  day?: string;
}

export const LOG_BACKDATE_DAYS = 7;

export function addLog(ctx: Ctx, n: NewLog, author: Author, clock = new Date()): { entry: LogEntry; day: string; n: number } {
  const project = ctx.project(n.project);
  const text = n.text.replaceAll('\r\n', '\n').trim();
  if (!text) throw new Error('log entry text is empty');
  const kind = n.kind === undefined ? undefined : declaredKind(project, n.kind);
  if (n.count !== undefined && !kind) throw new Error('a count needs a kind');
  const count = n.count === undefined ? undefined : positiveInt(n.count, 'count', 1000);
  const minutes = n.minutes === undefined ? undefined : positiveInt(n.minutes, 'minutes', 24 * 60);
  let issue: string | undefined;
  if (n.issue !== undefined) {
    const t = ctx.issue(n.issue);
    if (t.project !== project.key) throw new Error(`${t.id} is not in ${project.key}`);
    issue = t.id;
  }
  const current = workDay(clock);
  const day = n.day === undefined ? current : parseDay(n.day, clock);
  if (day > current) throw new Error(`${day} is in the future`);
  if (day < addDays(current, -LOG_BACKDATE_DAYS)) throw new Error(`${day} is more than ${LOG_BACKDATE_DAYS} days back`);
  const entry: LogEntry = {
    project: project.key,
    at: now(clock),
    ...author,
    text,
    ...(kind && { kind }),
    ...(count && { count }),
    ...(minutes && { minutes }),
    ...(issue && { issue }),
  };
  const entries = [...loadLog(ctx.dir, day), entry];
  saveLog(ctx.dir, day, entries);
  return { entry, day, n: entries.length };
}

/** `addr` is `<day>/<n>`. With `expectAt`, refuses when the entry there isn't the one that was loaded. */
export function deleteLog(ctx: Ctx, addr: string, expectAt?: string): LogEntry {
  const { day, n } = parseLogAddress(addr);
  const entries = loadLog(ctx.dir, day);
  if (n > entries.length) throw new Error(`${day} has no log entry #${n} (it has ${entries.length})`);
  const entry = entries[n - 1];
  if (expectAt !== undefined && entry.at !== expectAt) throw new Error(`log entry ${day}/${n} changed on disk since it was loaded`);
  saveLog(ctx.dir, day, entries.filter((_, i) => i !== n - 1));
  return entry;
}
