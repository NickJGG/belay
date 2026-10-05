'use server';
/** Thin wrappers: validate the untyped input, call one op on a fresh load, revalidate. */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { dataDir } from '../../src/config.ts';
import { ConflictError, Ctx, addComment, addIssue, bodyHash, deleteComment, deleteIssue, editComment, editProject, editIssue, moveProject, replaceBody, setFocus, setPriority, setStatus } from '../../src/ops.ts';
import type { DropPatch, MoveTarget } from '../../src/sidebar.ts';
import { THEMES, saveSettings, type Theme } from '../../src/settings.ts';
import { isAccent } from '@/lib/accents';

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
  try {
    const a = str(accent, 'accent');
    if (!isAccent(a)) throw new Error(`unknown accent '${a}'`);
    const t = str(theme, 'theme');
    if (!THEMES.includes(t as Theme)) throw new Error(`theme must be one of ${THEMES.join('|')}`);
    saveSettings(dataDir(), { accent: a, theme: t as Theme });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/', 'layout');
  return {};
}
