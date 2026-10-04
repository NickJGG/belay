'use server';
/** Thin wrappers: validate the untyped input, call one op on a fresh load, revalidate. */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { dataDir } from '../../src/config.ts';
import { ConflictError, Ctx, addTask, bodyHash, deleteTask, editProject, editTask, replaceBody, setFocus, setPriority, setStatus } from '../../src/ops.ts';
import { THEMES, saveSettings, type Theme } from '../../src/settings.ts';
import { isAccent } from '@/lib/accents';

export interface Result {
  error?: string;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`${what} must be a string`);
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

export async function setTaskStatus(id: unknown, status: unknown): Promise<Result> {
  return run((ctx) => void setStatus(ctx, str(id, 'id'), str(status, 'status')));
}

export async function setTaskPriority(id: unknown, high: unknown): Promise<Result> {
  return run((ctx) => void setPriority(ctx, str(id, 'id'), high === true));
}

export async function setTaskTitle(id: unknown, title: unknown): Promise<Result> {
  return run((ctx) => void editTask(ctx, str(id, 'id'), { title: str(title, 'title') }));
}

export async function setTaskBlockers(id: unknown, blockers: unknown): Promise<Result> {
  if (!Array.isArray(blockers)) return { error: 'blockers must be a list' };
  return run((ctx) => void editTask(ctx, str(id, 'id'), { blockers: blockers.map((b) => str(b, 'blocker')) }));
}

export type BodyResult = Result & {
  /** The hash of the body now on disk, to base the next save on. */
  hash?: string;
  /** Set on a hash mismatch: the body on disk, which was left untouched. */
  conflict?: string;
};

export async function saveTaskBody(id: unknown, body: unknown, expectedHash: unknown): Promise<BodyResult> {
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

/** On success, navigates to the task's project, since its own page no longer exists. */
export async function removeTask(id: unknown): Promise<Result> {
  let project = '';
  const r = await run((ctx) => {
    const t = ctx.task(str(id, 'id'));
    project = t.project;
    deleteTask(ctx, t.id);
  });
  if (r.error) return r;
  redirect(`/p/${encodeURIComponent(project)}`);
}

export async function setProjectFocus(key: unknown, focus: unknown): Promise<Result> {
  return run((ctx) => void setFocus(ctx, str(key, 'key'), focus === true));
}

export async function quickAdd(key: unknown, title: unknown, status: unknown): Promise<Result & { id?: string }> {
  let id: string | undefined;
  const r = await run((ctx) => {
    id = addTask(ctx, { project: str(key, 'key'), title: str(title, 'title'), status: str(status, 'status') }).id;
  });
  return { ...r, id };
}

export async function updateProject(key: unknown, name: unknown, group: unknown, status: unknown): Promise<Result> {
  return run((ctx) => void editProject(ctx, str(key, 'key'), { name: str(name, 'name'), group: str(group, 'group'), status: str(status, 'status') }));
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
