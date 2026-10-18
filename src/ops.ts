/**
 * Validated write operations shared by the CLI and the dashboard server. Each one takes a fresh `Ctx`,
 * so the file it saves was read just before, and a concurrent edit by Claude isn't clobbered.
 */
import { createHash } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { dataDir } from './config.ts';
import { commitAll } from './gitlog.ts';
import { loadLog, loadLogDays, loadLogs, parseLogAddress, saveLog, type DatedEntry, type LogEntry } from './logs.ts';
import { suggestKey } from './projectkey.ts';
import { indexIssues, openBlockers } from './query.ts';
import { ACCENT_KEYS, THEMES, loadSettings, saveSettings, type Settings } from './settings.ts';
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
  type BadFile,
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

export const badFileNote = (b: BadFile) => `${b.file} (${b.error})`;

function loadOrderLenient(dir: string, bad: BadFile[] | undefined): string[] {
  try {
    return loadOrder(dir);
  } catch (e) {
    if (!bad) throw e;
    bad.push({ file: 'order.yaml', error: (e as Error).message.replace(/^order.yaml:s*/, '') });
    return [];
  }
}

export class Ctx {
  readonly dir: string;
  /** As stored in `order.yaml`; may be partial or hold stale keys. */
  readonly order: string[];
  /** Sorted by `order` (see `sortByOrder`). */
  readonly projects: Project[];
  readonly issues: Issue[];
  readonly byId: Map<string, Issue>;
  /** Files a lenient load skipped; always empty when strict. */
  readonly bad: BadFile[] = [];
  readonly #logs = new Map<string, DatedEntry[]>();
  #depth = 0;

  /** Strict by default: any bad file throws. Lenient is for read paths, which show what loaded and report `bad`. */
  constructor(dir = dataDir(), { lenient = false } = {}) {
    this.dir = dir;
    const bad = lenient ? this.bad : undefined;
    this.order = loadOrderLenient(dir, bad);
    this.projects = sortByOrder(loadProjects(dir, { bad }), this.order);
    this.issues = loadIssues(dir, { bad });
    this.byId = indexIssues(this.issues);
  }

  project(key: string): Project {
    const p = this.projects.find((x) => x.key === canon(key));
    if (!p) throw new Error(`no project '${key}' (see 'belay project list')`);
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

  /**
   * Runs a write op and, if the data dir has git history, commits what it wrote as `<message> - <author>`.
   * Nested ops commit once, with the outermost op's message.
   */
  record<T>(fn: () => T, message: (result: T) => string): T {
    if (this.bad.length) throw new Error(`not writing while files are bad: ${this.bad.map(badFileNote).join('; ')}`);
    this.#depth++;
    let result: T;
    try {
      result = fn();
    } finally {
      this.#depth--;
    }
    if (this.#depth === 0) {
      const { by, session } = commentAuthor(process.env);
      commitAll(this.dir, `${message(result)} - ${by}`, session && `Session: ${session}`);
    }
    return result;
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
  return ctx.record(
    () => {
      const current = ctx.issue(id);
      const status = oneOf(value, ISSUE_STATUSES, 'status');
      const transitions =
        status === current.status ? current.transitions : [...(current.transitions ?? []), { at: now(), from: current.status, to: status, ...author }];
      const issue = { ...current, status, updated: now(), ...(transitions && { transitions }) };
      saveIssue(ctx.dir, issue);
      return { before: current.status, issue, open: openBlockers(current, ctx.byId) };
    },
    (r) => `set ${r.issue.id} ${r.before}->${r.issue.status}`,
  );
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
  return ctx.record(
    () => {
      const title = t.title.trim();
      if (!title) throw new Error('title is empty');
      const project = ctx.project(t.project);
      const blockers = ctx.checkBlockers(undefined, t.blockers ?? []);
      const d = new Date();
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
        created: today(d),
        updated: now(d),
        comments: [],
        transitions: [{ at: now(d), to: status, ...author }],
        body: (t.body ?? '').trim(),
      });
    },
    (issue) => `add ${issue.id} "${issue.title}"`,
  );
}

export function setPriority(ctx: Ctx, id: string, high: boolean): Issue {
  return ctx.record(
    () => {
      const issue = { ...ctx.issue(id), priority: high ? ('high' as const) : undefined, updated: now() };
      saveIssue(ctx.dir, issue);
      return issue;
    },
    (issue) => `priority ${issue.id} ${high ? 'high' : 'none'}`,
  );
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

/** The keys a patch sets, for a commit subject. */
function patched(patch: object): string {
  return Object.entries(patch)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k)
    .join(',');
}

export function editIssue(ctx: Ctx, id: string, patch: IssuePatch): Issue {
  return ctx.record(
    () => {
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
      issue.updated = now();
      saveIssue(ctx.dir, issue);
      return issue;
    },
    (issue) => `edit ${issue.id} ${patched(patch)}`.trimEnd(),
  );
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
  return ctx.record(
    () => {
      const current = ctx.issue(id).body;
      if (expectedHash !== undefined && expectedHash !== bodyHash(current)) throw new ConflictError(id, current);
      return editIssue(ctx, id, { body });
    },
    (issue) => `body ${issue.id}`,
  );
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
  return ctx.record(
    () => {
      const current = ctx.issue(id);
      const comment = { at: now(), ...author, text: commentText(text) };
      const issue = { ...current, comments: [...current.comments, comment], updated: now() };
      saveIssue(ctx.dir, issue);
      return { issue, n: issue.comments.length };
    },
    (r) => `comment ${r.issue.id} #${r.n}`,
  );
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
  return ctx.record(
    () => {
      const current = ctx.issue(id);
      const i = commentIndex(current, n, expectAt);
      const comments = current.comments.map((c, j) => (j === i ? { ...c, text: commentText(text) } : c));
      const issue = { ...current, comments, updated: now() };
      saveIssue(ctx.dir, issue);
      return issue;
    },
    (issue) => `comment edit ${issue.id} #${n}`,
  );
}

export function deleteComment(ctx: Ctx, id: string, n: number, expectAt?: string): Issue {
  return ctx.record(
    () => {
      const current = ctx.issue(id);
      const i = commentIndex(current, n, expectAt);
      const issue = { ...current, comments: current.comments.filter((_, j) => j !== i), updated: now() };
      saveIssue(ctx.dir, issue);
      return issue;
    },
    (issue) => `comment delete ${issue.id} #${n}`,
  );
}

/**
 * Strips `id` from every dependent's `blocked_by` (with a comment by `author`) before removing the file,
 * so a crash midway leaves an orphaned issue rather than a dangling reference. Returns the dependents.
 */
export function deleteIssue(ctx: Ctx, typed: string, author: Author): Issue[] {
  const { id } = ctx.issue(typed);
  return ctx.record(
    () => {
      const at = now();
      const dependents = ctx.issues
        .filter((t) => t.blocked_by.includes(id))
        .map((t) => ({
          ...t,
          blocked_by: t.blocked_by.filter((b) => b !== id),
          comments: [...t.comments, { at, ...author, text: `blocker ${id} deleted` }],
          updated: now(),
        }));
      for (const t of dependents) saveIssue(ctx.dir, t);
      deleteIssueFile(ctx.dir, id);
      return dependents;
    },
    () => `delete ${id}`,
  );
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
  /** Replaces the list; can't be empty. */
  paths?: string[];
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
  if (!kinds.length) throw new Error(`${p.key} declares no kinds ('belay project set ${p.key} --kinds a,b')`);
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
  return ctx.record(
    () => {
      const p = { ...ctx.project(key) };
      if (patch.name !== undefined) {
        if (!patch.name.trim()) throw new Error('name is empty');
        p.name = patch.name.trim();
      }
      if (patch.paths !== undefined) {
        if (!patch.paths.length) throw new Error('at least one path is required');
        p.paths = patch.paths.map(normalizeStoredPath);
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
    },
    (p) => `project edit ${p.key} ${patched(patch)}`.trimEnd(),
  );
}

export type { MoveTarget };

/** Saves the full order, so projects that were unlisted get pinned where they currently sort. */
export function moveProject(ctx: Ctx, key: string, where: MoveTarget): string[] {
  const moved = ctx.project(key).key;
  const anchor = typeof where === 'string' ? where : 'before' in where ? { before: ctx.project(where.before).key } : { after: ctx.project(where.after).key };
  return ctx.record(
    () => {
      const keys = reorder(ctx.projects.map((p) => p.key), moved, anchor);
      saveOrder(ctx.dir, keys);
      return keys;
    },
    () => `move ${moved} ${typeof anchor === 'string' ? anchor : 'before' in anchor ? `before ${anchor.before}` : `after ${anchor.after}`}`,
  );
}

export function setFocus(ctx: Ctx, key: string, focus: boolean): Project {
  return ctx.record(
    () => editProject(ctx, key, { focus }),
    (p) => `focus ${p.key} ${focus ? 'on' : 'off'}`,
  );
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
  return ctx.record(
    () => {
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
    },
    (r) => `project add ${r.project.key} "${r.project.name}"`,
  );
}

/**
 * Renames a project's key and its issues' IDs (numbers kept), rewriting `blocked_by` and log entries everywhere.
 * New files are written before old ones are removed, so a crash leaves duplicates, never lost issues.
 */
export function rekeyProject(ctx: Ctx, from: string, to: string): { project: Project; renamed: Map<string, string> } {
  const old = ctx.project(from);
  return ctx.record(
    () => {
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
      for (const day of loadLogDays(ctx.dir)) {
        const entries = loadLog(ctx.dir, day);
        if (!entries.some((e) => e.project === old.key || (e.issue && renamed.has(e.issue)))) continue;
        saveLog(ctx.dir, day, entries.map((e) => ({
          ...e,
          project: e.project === old.key ? key : e.project,
          ...(e.issue && { issue: renamed.get(e.issue) ?? e.issue }),
        })));
      }
      for (const t of own) deleteIssueFile(ctx.dir, t.id);
      unlinkSync(projectFile(ctx.dir, old.key));
      if (ctx.order.includes(old.key)) saveOrder(ctx.dir, ctx.order.map((k) => (k === old.key ? key : k)));
      return { project, renamed };
    },
    (r) => `project rekey ${old.key}->${r.project.key}`,
  );
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

/** The work days a log entry may be filed under or moved to, `current` first. */
export function logDays(current: string): string[] {
  return Array.from({ length: LOG_BACKDATE_DAYS + 1 }, (_, i) => addDays(current, -i));
}

/** A work day a log entry may be filed under: today back to `LOG_BACKDATE_DAYS` ago. */
function logDay(value: string, clock: Date): string {
  const current = workDay(clock);
  const day = parseDay(value, clock);
  if (day > current) throw new Error(`${day} is in the future`);
  if (day < addDays(current, -LOG_BACKDATE_DAYS)) throw new Error(`${day} is more than ${LOG_BACKDATE_DAYS} days back`);
  return day;
}

function projectIssue(ctx: Ctx, project: Project, id: string): string {
  const t = ctx.issue(id);
  if (t.project !== project.key) throw new Error(`${t.id} is not in ${project.key}`);
  return t.id;
}

export function addLog(ctx: Ctx, n: NewLog, author: Author, clock = new Date()): { entry: LogEntry; day: string; n: number } {
  return ctx.record(
    () => {
      const project = ctx.project(n.project);
      const text = n.text.replaceAll('\r\n', '\n').trim();
      if (!text) throw new Error('log entry text is empty');
      const kind = n.kind === undefined ? undefined : declaredKind(project, n.kind);
      if (n.count !== undefined && !kind) throw new Error('a count needs a kind');
      const count = n.count === undefined ? undefined : positiveInt(n.count, 'count', 1000);
      const minutes = n.minutes === undefined ? undefined : positiveInt(n.minutes, 'minutes', 24 * 60);
      const issue = n.issue === undefined ? undefined : projectIssue(ctx, project, n.issue);
      const day = n.day === undefined ? workDay(clock) : logDay(n.day, clock);
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
    },
    (r) => `log add ${r.entry.project} ${r.day}/${r.n}`,
  );
}

/** `addr` is `<day>/<n>`. With `expectAt`, refuses when the entry there isn't the one that was loaded. */
function findLog(ctx: Ctx, addr: string, expectAt: string | undefined): { day: string; n: number; entries: LogEntry[]; entry: LogEntry } {
  const { day, n } = parseLogAddress(addr);
  const entries = loadLog(ctx.dir, day);
  if (n > entries.length) throw new Error(`${day} has no log entry #${n} (it has ${entries.length})`);
  const entry = entries[n - 1];
  if (expectAt !== undefined && entry.at !== expectAt) throw new Error(`log entry ${day}/${n} changed on disk since it was loaded`);
  return { day, n, entries, entry };
}

export function deleteLog(ctx: Ctx, addr: string, expectAt?: string): LogEntry {
  return ctx.record(
    () => {
      const { day, n, entries, entry } = findLog(ctx, addr, expectAt);
      saveLog(ctx.dir, day, entries.filter((_, i) => i !== n - 1));
      return entry;
    },
    (entry) => `log delete ${entry.project} ${addr}`,
  );
}

/** `''` or `null` clears a field; clearing `kind` clears `count` too. `day` moves the entry to the end of that day. */
export interface LogPatch {
  text?: string;
  kind?: string;
  count?: number | null;
  minutes?: number | null;
  issue?: string;
  day?: string;
}

/** `at`, `by`, `session` and `project` never change. Returns the entry's (possibly new) address. */
export function editLog(ctx: Ctx, addr: string, patch: LogPatch, expectAt?: string, clock = new Date()): { entry: LogEntry; day: string; n: number } {
  return ctx.record(
    () => {
      const { day, n, entries, entry: old } = findLog(ctx, addr, expectAt);
      const project = ctx.project(old.project);
      const e: LogEntry = { ...old };
      if (patch.text !== undefined) {
        const text = patch.text.replaceAll('\r\n', '\n').trim();
        if (!text) throw new Error('log entry text is empty');
        e.text = text;
      }
      if (patch.kind !== undefined) {
        if (patch.kind.trim()) e.kind = declaredKind(project, patch.kind);
        else {
          delete e.kind;
          delete e.count;
        }
      }
      if (patch.count === null) delete e.count;
      else if (patch.count !== undefined) {
        if (!e.kind) throw new Error('a count needs a kind');
        e.count = positiveInt(patch.count, 'count', 1000);
      }
      if (patch.minutes === null) delete e.minutes;
      else if (patch.minutes !== undefined) e.minutes = positiveInt(patch.minutes, 'minutes', 24 * 60);
      if (patch.issue !== undefined) {
        if (patch.issue.trim()) e.issue = projectIssue(ctx, project, patch.issue);
        else delete e.issue;
      }
      const target = patch.day === undefined ? day : parseDay(patch.day, clock);
      if (target === day) {
        saveLog(ctx.dir, day, entries.map((x, i) => (i === n - 1 ? e : x)));
        return { entry: e, day, n };
      }
      logDay(target, clock);
      const moved = [...loadLog(ctx.dir, target), e];
      saveLog(ctx.dir, target, moved);
      saveLog(ctx.dir, day, entries.filter((_, i) => i !== n - 1));
      return { entry: e, day: target, n: moved.length };
    },
    (r) => {
      const to = `${r.day}/${r.n}`;
      return `log edit ${r.entry.project} ${addr}${to === addr ? '' : `->${to}`} ${patched(patch)}`.trimEnd();
    },
  );
}

export interface SettingsPatch {
  theme?: string;
  accent?: string;
}

export function setSettings(ctx: Ctx, patch: SettingsPatch): Settings {
  return ctx.record(
    () => {
      const s = loadSettings(ctx.dir);
      if (patch.theme !== undefined) s.theme = oneOf(patch.theme, THEMES, 'theme');
      if (patch.accent !== undefined) s.accent = oneOf(patch.accent, ACCENT_KEYS, 'accent');
      saveSettings(ctx.dir, s);
      return s;
    },
    (s) => ['settings', ...(['theme', 'accent'] as const).filter((k) => patch[k] !== undefined).map((k) => `${k}=${s[k]}`)].join(' '),
  );
}
