/**
 * The bundled extensions, found by their `extensions/<id>/belay.json`, and which of them are Installed
 * (`extensions/installed.json`). Imports only node:fs and node:path, so the proxy, the store and the statusline can
 * read them cheaply; both files are re-read only when they change.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type ExtensionId = string;

/**
 * An issue frontmatter key an extension owns, saved right after `after` (a core field, or an earlier owned one). Its
 * value is optional text, validated whether or not the extension is active.
 */
export interface OwnedField {
  key: string;
  after: string;
}

/** An extension's `belay.json`. */
export interface ExtensionInfo {
  id: ExtensionId;
  name: string;
  summary: string;
  /** Its Extension mark, drawn by the site's `StrokeMark`. */
  mark: { path: string; dot: { x: number; y: number; r: number } };
  fields: readonly OwnedField[];
  /** The site paths it owns, gated by the proxy while it's inactive. `*` matches one segment. */
  paths: readonly string[];
  /** Its sessions' folder in the data dir. */
  sessions: string;
  /** Whether its sessions go into the data dir's history (grills do), rather than being ignored whole. */
  history: boolean;
}

// Next bundles this module, so its own location means nothing there; the site's server always runs in web/.
export const REPO = process.env.NEXT_RUNTIME ? resolve(/*turbopackIgnore: true*/ process.cwd(), '..') : resolve(import.meta.dirname, '..');

export const ID = /^[a-z][a-z0-9-]*$/;
/** The data dir's own folders, which no extension's sessions may take. */
const CORE_FOLDERS = new Set(['projects', 'issues', 'log', 'cache']);

const isString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** Throws on a `belay.json` that isn't a valid extension for its folder. */
export function parseInfo(src: string, folder: string): ExtensionInfo {
  const where = `extensions/${folder}/belay.json`;
  const fail = (why: string): never => {
    throw new Error(`${where}: ${why}`);
  };
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(src);
  } catch (e) {
    return fail((e as Error).message);
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) fail('not an object');
  if (typeof j.id !== 'string' || !ID.test(j.id)) fail(`'id' must match ${ID}`);
  if (j.id !== folder) fail(`'id' is '${j.id}', not its folder's name`);
  for (const k of ['name', 'summary'] as const) if (!isString(j[k])) fail(`'${k}' must be a non-empty string`);
  const mark = j.mark as ExtensionInfo['mark'] | undefined;
  const dot = mark?.dot;
  if (!isString(mark?.path) || !dot || ![dot.x, dot.y, dot.r].every((n) => typeof n === 'number')) fail("'mark' must be { path, dot: { x, y, r } }");
  const fields = j.fields ?? [];
  if (!Array.isArray(fields) || !fields.every((f) => isString(f?.key) && isString(f?.after))) fail("'fields' must be a list of { key, after }");
  const paths = j.paths ?? [];
  if (!Array.isArray(paths) || !paths.every((p) => typeof p === 'string' && p.startsWith('/'))) fail("'paths' must be a list of paths starting with /");
  if (typeof j.sessions !== 'string' || !ID.test(j.sessions) || CORE_FOLDERS.has(j.sessions)) fail("'sessions' must be a folder name of its own");
  if (j.history !== undefined && typeof j.history !== 'boolean') fail("'history' must be true or false");
  return {
    id: j.id as string,
    name: j.name as string,
    summary: j.summary as string,
    mark: { path: mark!.path, dot: { x: dot!.x, y: dot!.y, r: dot!.r } },
    fields: (fields as OwnedField[]).map((f) => ({ key: f.key, after: f.after })),
    paths: paths as string[],
    sessions: j.sessions as string,
    history: j.history === true,
  };
}

/** Throws on two extensions claiming one issue key or one session folder. */
export function checkClaims(infos: readonly ExtensionInfo[]): void {
  const keys = new Map<string, string>();
  const folders = new Map<string, string>();
  for (const e of infos) {
    for (const f of e.fields) {
      const other = keys.get(f.key);
      if (other) throw new Error(`extensions '${other}' and '${e.id}' both claim the issue key '${f.key}'`);
      keys.set(f.key, e.id);
    }
    const other = folders.get(e.sessions);
    if (other) throw new Error(`extensions '${other}' and '${e.id}' both keep sessions in '${e.sessions}'`);
    folders.set(e.sessions, e.id);
  }
}

const stampOf = (file: string) => {
  try {
    const s = statSync(/*turbopackIgnore: true*/ file);
    return `${s.mtimeMs}:${s.size}`;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw e;
  }
};

const found = new Map<string, { stamp: string; infos: readonly ExtensionInfo[] }>();

/** Every bundled extension under `<root>/extensions/`, by id. Throws on an invalid one. */
export function bundled(root = REPO): readonly ExtensionInfo[] {
  const dir = join(root, 'extensions');
  let folders: string[];
  try {
    folders = readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const files = folders.map((f) => ({ folder: f, file: join(dir, f, 'belay.json') }));
  const withStamps = files.map((f) => ({ ...f, stamp: stampOf(f.file) })).filter((f) => f.stamp !== 'missing');
  const stamp = withStamps.map((f) => `${f.folder}=${f.stamp}`).join('|');
  const cached = found.get(dir);
  if (cached?.stamp === stamp) return cached.infos;
  const infos = withStamps.map((f) => parseInfo(readFileSync(/*turbopackIgnore: true*/ f.file, 'utf8'), f.folder));
  checkClaims(infos);
  found.set(dir, { stamp, infos });
  return infos;
}

export const installedFile = (root = REPO) => join(root, 'extensions', 'installed.json');

/** The ids an `installed.json` lists. Throws unless it's `{ "installed": [<id>, …] }`. */
export function parseInstalled(src: string): ExtensionId[] {
  const j = JSON.parse(src);
  if (!Array.isArray(j?.installed) || !j.installed.every((id: unknown) => typeof id === 'string')) {
    throw new Error('extensions/installed.json: expected { "installed": [<id>, …] }');
  }
  return j.installed;
}

const records = new Map<string, { stamp: string; ids: readonly ExtensionId[] }>();

/**
 * The Installed extensions, in bundled order: those the clone's record (written by `belay extension install`) lists
 * that are bundled. With no record, none are.
 */
export function installedIds(root = REPO): ExtensionId[] {
  const ids = bundled(root).map((e) => e.id);
  const file = installedFile(root);
  const stamp = stampOf(file);
  let cached = records.get(file);
  if (cached?.stamp !== stamp) {
    cached = { stamp, ids: stamp === 'missing' ? [] : parseInstalled(readFileSync(/*turbopackIgnore: true*/ file, 'utf8')) };
    records.set(file, cached);
  }
  const listed = cached.ids;
  return ids.filter((id) => listed.includes(id));
}

export const extensionInfo = (id: ExtensionId, root = REPO): ExtensionInfo | undefined => bundled(root).find((e) => e.id === id);

export const isExtensionId = (s: string, root = REPO): boolean => !!extensionInfo(s, root);

const segments = (p: string) => p.split('/').filter(Boolean);

/** Whether `pathname` is `pattern` or below it, segment by segment: `/learn` matches `/learn/x`, not `/learning`. */
export function matchesPattern(pathname: string, pattern: string): boolean {
  const path = segments(pathname);
  const pat = segments(pattern);
  return pat.length <= path.length && pat.every((s, i) => s === '*' || s === path[i]);
}

/** The first extension in `ids` whose paths match `pathname`. */
export function ownerOfPath(pathname: string, ids: Iterable<ExtensionId>, root = REPO): ExtensionId | undefined {
  for (const id of ids) if (extensionInfo(id, root)?.paths.some((p) => matchesPattern(pathname, p))) return id;
}
