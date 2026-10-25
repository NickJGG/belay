'use server';
/** Thin wrappers: validate the untyped input, call one op on a fresh load, revalidate. */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { dataDir, grillRoots } from '../../src/config.ts';
import { grillFile, grillPreview, isGrillSlug } from '../../src/grill.ts';
import { ConflictError, Ctx, addComment, addIssue, addLog, bodyHash, deleteComment, deleteIssue, deleteLog, editComment, editLog, editProject, editIssue, moveProject, replaceBody, setFocus, setPriority, setSettings, setStatus } from '../../src/ops.ts';
import { logFile } from '../../src/logs.ts';
import { isLinked, linkedPath, openFile } from '../../src/open.ts';
import type { DropPatch, MoveTarget } from '../../src/sidebar.ts';
import { isDay } from '../../src/workday.ts';

export interface Result {
  error?: string;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`${what} must be a string`);
  return v;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number') throw new Error(`${what} must be a number`);
  return v;
}

async function run(op: (ctx: Ctx) => void): Promise<Result> {
  try {
    op(new Ctx(dataDir()));
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/', 'layout');
  return {};
}

export async function setIssueStatus(id: unknown, status: unknown): Promise<Result> {
  return run((ctx) => void setStatus(ctx, str(id, 'id'), str(status, 'status')));
}

export async function setIssuePriority(id: unknown, high: unknown): Promise<Result> {
  return run((ctx) => void setPriority(ctx, str(id, 'id'), high === true));
}

export async function setIssueTitle(id: unknown, title: unknown): Promise<Result> {
  return run((ctx) => void editIssue(ctx, str(id, 'id'), { title: str(title, 'title') }));
}

export async function setIssueBlockers(id: unknown, blockers: unknown): Promise<Result> {
  if (!Array.isArray(blockers)) return { error: 'blockers must be a list' };
  return run((ctx) => void editIssue(ctx, str(id, 'id'), { blockers: blockers.map((b) => str(b, 'blocker')) }));
}

export type BodyResult = Result & {
  /** The hash of the body now on disk, to base the next save on. */
  hash?: string;
  /** Set on a hash mismatch: the body on disk, which was left untouched. */
  conflict?: string;
};

export async function saveIssueBody(id: unknown, body: unknown, expectedHash: unknown): Promise<BodyResult> {
  let saved: string;
  try {
    saved = replaceBody(new Ctx(dataDir()), str(id, 'id'), str(body, 'body'), str(expectedHash, 'hash')).body;
  } catch (e) {
    if (e instanceof ConflictError) return { error: e.message, conflict: e.current, hash: bodyHash(e.current) };
    return { error: (e as Error).message };
  }
  revalidatePath('/', 'layout');
  return { hash: bodyHash(saved) };
}

export async function addIssueComment(id: unknown, text: unknown): Promise<Result> {
  return run((ctx) => void addComment(ctx, str(id, 'id'), str(text, 'text'), { by: 'user' }));
}

/** `at` is comment `#n`'s `at` as loaded: the op refuses if `#n` is no longer that comment. */
export async function editIssueComment(id: unknown, n: unknown, at: unknown, text: unknown): Promise<Result> {
  return run((ctx) => void editComment(ctx, str(id, 'id'), num(n, 'n'), str(text, 'text'), str(at, 'at')));
}

export async function deleteIssueComment(id: unknown, n: unknown, at: unknown): Promise<Result> {
  return run((ctx) => void deleteComment(ctx, str(id, 'id'), num(n, 'n'), str(at, 'at')));
}

/** On success, navigates to the issue's project, since its own page no longer exists. */
export async function removeIssue(id: unknown): Promise<Result> {
  let project = '';
  const r = await run((ctx) => {
    const t = ctx.issue(str(id, 'id'));
    project = t.project;
    deleteIssue(ctx, t.id, { by: 'user' });
  });
  if (r.error) return r;
  redirect(`/p/${encodeURIComponent(project)}`);
}

export async function setProjectFocus(key: unknown, focus: unknown): Promise<Result> {
  return run((ctx) => void setFocus(ctx, str(key, 'key'), focus === true));
}

export async function createIssue(input: unknown): Promise<Result & { id?: string }> {
  let id: string | undefined;
  const r = await run((ctx) => {
    if (!input || typeof input !== 'object') throw new Error('input must be an object');
    const { project, title, status, high, blockers, body } = input as Record<string, unknown>;
    if (!Array.isArray(blockers)) throw new Error('blockers must be a list');
    id = addIssue(ctx, {
      project: str(project, 'project'),
      title: str(title, 'title'),
      status: str(status, 'status'),
      priority: high === true ? 'high' : undefined,
      blockers: blockers.map((b) => str(b, 'blocker')),
      body: str(body, 'body'),
    }).id;
  });
  return r.error ? r : { id };
}

export async function setProjectName(key: unknown, name: unknown): Promise<Result> {
  return run((ctx) => void editProject(ctx, str(key, 'key'), { name: str(name, 'name') }));
}

export async function setProjectGroup(key: unknown, group: unknown): Promise<Result> {
  return run((ctx) => void editProject(ctx, str(key, 'key'), { group: str(group, 'group') }));
}

export async function setProjectStatus(key: unknown, status: unknown): Promise<Result> {
  return run((ctx) => void editProject(ctx, str(key, 'key'), { status: str(status, 'status') }));
}

/** `kinds` is comma-separated, as typed. */
export async function setProjectKinds(key: unknown, kinds: unknown): Promise<Result> {
  return run((ctx) => void editProject(ctx, str(key, 'key'), { kinds: str(kinds, 'kinds').split(',') }));
}

function optStr(v: unknown, what: string): string | undefined {
  return v === undefined || v === '' ? undefined : str(v, what);
}

/** `day` is `today`, `yesterday` or a work day. */
export async function createLog(input: unknown): Promise<Result> {
  return run((ctx) => {
    if (!input || typeof input !== 'object') throw new Error('input must be an object');
    const { project, text, kind, count, day } = input as Record<string, unknown>;
    addLog(
      ctx,
      {
        project: str(project, 'project'),
        text: str(text, 'text'),
        kind: optStr(kind, 'kind'),
        count: count === undefined ? undefined : num(count, 'count'),
        day: optStr(day, 'day'),
      },
      { by: 'user' },
    );
  });
}

/**
 * `at` is the entry's `at` as loaded: the op refuses if the address now holds another entry.
 * On success, navigates to the project's Logs tab, since the entry's own page no longer exists.
 */
export async function deleteLogEntry(address: unknown, at: unknown): Promise<Result> {
  let project = '';
  const r = await run((ctx) => void (project = deleteLog(ctx, str(address, 'address'), str(at, 'at')).project));
  if (r.error) return r;
  redirect(`/p/${encodeURIComponent(project)}?tab=logs`);
}

/** `''` or `null` clears a number. */
function optNum(v: unknown, what: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  return num(v, what);
}

/** `patch` is a `LogPatch`. A day move changes the entry's address, so it navigates to the new one. */
export async function editLogEntry(address: unknown, at: unknown, patch: unknown): Promise<Result> {
  let moved: string | undefined;
  const r = await run((ctx) => {
    if (!patch || typeof patch !== 'object') throw new Error('patch must be an object');
    const { text, kind, count, minutes, issue, day } = patch as Record<string, unknown>;
    const opt = (v: unknown, what: string) => (v === undefined ? undefined : str(v, what));
    const addr = str(address, 'address');
    const e = editLog(
      ctx,
      addr,
      { text: opt(text, 'text'), kind: opt(kind, 'kind'), count: optNum(count, 'count'), minutes: optNum(minutes, 'minutes'), issue: opt(issue, 'issue'), day: opt(day, 'day') },
      str(at, 'at'),
    );
    if (`${e.day}/${e.n}` !== addr) moved = `/l/${e.day}/${e.n}?at=${encodeURIComponent(e.entry.at)}`;
  });
  if (r.error || !moved) return r;
  redirect(moved);
}

function dropPatch(v: unknown): DropPatch | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v !== 'object') throw new Error('patch must be an object');
  const { focus, group } = v as Record<string, unknown>;
  if (focus !== undefined && typeof focus !== 'boolean') throw new Error('focus must be a boolean');
  return { focus, group: group === undefined ? undefined : str(group, 'group') };
}

function moveTarget(v: unknown): MoveTarget {
  if (v === 'top' || v === 'bottom') return v;
  if (v && typeof v === 'object') {
    if ('before' in v) return { before: str(v.before, 'before') };
    if ('after' in v) return { after: str(v.after, 'after') };
  }
  throw new Error('move must be top, bottom, {before} or {after}');
}

/** A sidebar drop: the focus/group change (if any) and the reorder, as one action. */
export async function moveProjectTo(key: unknown, patch: unknown, move: unknown): Promise<Result> {
  return run((ctx) => {
    const k = str(key, 'key');
    const p = dropPatch(patch);
    const where = moveTarget(move);
    if (p) editProject(ctx, k, p);
    moveProject(ctx, k, where);
  });
}

export async function updateSettings(accent: unknown, theme: unknown): Promise<Result> {
  return run((ctx) => void setSettings(ctx, { accent: str(accent, 'accent'), theme: str(theme, 'theme') }));
}

/** Opens the issue's file, grill session or plan on this machine. The path comes from the issue, never the client. */
export async function openLinkedFile(id: unknown, kind: unknown): Promise<Result> {
  try {
    if (!isLinked(kind)) throw new Error('kind must be file|grill|plan');
    const data = dataDir();
    const path = linkedPath(new Ctx(data).issue(str(id, 'id')), kind, { data, ...grillRoots() });
    if (!path) throw new Error(`no ${kind} on ${id}`);
    openFile(path);
  } catch (e) {
    return { error: (e as Error).message };
  }
  return {};
}

/** Opens a grill session's file on this machine. Only a validated slug comes from the client, never a path. */
export async function openGrillFile(slug: unknown): Promise<Result> {
  try {
    const s = str(slug, 'slug');
    if (!isGrillSlug(s)) throw new Error(`not a grill session: '${s}'`);
    openFile(grillFile(grillRoots(), s));
  } catch (e) {
    return { error: (e as Error).message };
  }
  return {};
}

/** Opens a grill session's preview doc on this machine. Only a validated slug comes from the client, never a path. */
export async function openGrillPreview(slug: unknown): Promise<Result> {
  try {
    const s = str(slug, 'slug');
    if (!isGrillSlug(s)) throw new Error(`not a grill session: '${s}'`);
    openFile(grillPreview(grillRoots(), s));
  } catch (e) {
    return { error: (e as Error).message };
  }
  return {};
}

/** Opens a work day's log file on this machine. */
export async function openLogFile(day: unknown): Promise<Result> {
  try {
    const d = str(day, 'day');
    if (!isDay(d)) throw new Error(`day must be YYYY-MM-DD (got '${d}')`);
    openFile(logFile(dataDir(), d));
  } catch (e) {
    return { error: (e as Error).message };
  }
  return {};
}
