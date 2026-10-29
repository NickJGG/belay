/**
 * The CLI's extension manifests, the reader for `settings.yaml`'s `extensions:` map, and `isActive`. Which extensions
 * exist, and their owned fields, come from their `belay.json` (`extension-ids.ts`). Imports only types from store.ts,
 * which imports it for the known issue keys.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ParseArgsConfig } from 'node:util';
import { isMap, parseDocument } from 'yaml';
import { dataDir, sessionsDir } from './config.ts';
import { bundled, extensionInfo, installedIds, isExtensionId, type ExtensionId, type ExtensionInfo, type OwnedField } from './extension-ids.ts';
import { manifest as grill } from './extensions/grill/manifest.ts';
import { manifest as learn } from './extensions/learn/manifest.ts';
import type { Issue, Project } from './store.ts';

export type { OwnedField };

export type Command = (argv: string[]) => void | Promise<void>;

/** Its lines in `belay help`. */
export interface CliHelp {
  /** Usage entries, each placed after the entry of the command `after` names. */
  commands?: readonly { after: string; usage: string; text: string }[];
  /** Flags added to `add`'s and `edit`'s usage. */
  add?: string;
  edit?: string;
  /** Added to `belay claude`'s description. */
  claude?: string;
  /** What else `belay search` finds, e.g. `grill sessions (slug, topic, project)`. */
  search?: string;
}

/** The CLI's slots. Loaders are literal `import()`s, so an extension's code loads only when a command uses it. */
export interface CliSlots {
  /** Subcommands, by name. */
  commands?: Readonly<Record<string, () => Promise<Command>>>;
  /** `belay search` hits as output lines, after the issues. */
  search?: () => Promise<(words: string[], data: string) => string[]>;
  /** The digest's lines after the core ones; never after a compaction. */
  digest?: () => Promise<(project: Project, issues: Issue[], data: string) => string[]>;
  /** File kinds the dashboard opens from an issue: the path, or undefined when the issue has none. */
  linked?: Readonly<Record<string, (issue: Issue, data: string) => Promise<string | undefined>>>;
  /** Runs as it's switched off, inside the settings write, to drop what only matters while it's on. Never touches its data. */
  disabled?: (data: string) => void;
  help?: CliHelp;
}

export interface ExtensionManifest {
  id: ExtensionId;
  /** Its Claude Code skills, which stay installed while it's off. */
  skills: readonly string[];
  cli?: CliSlots;
}

export const MANIFESTS: readonly ExtensionManifest[] = [grill, learn];

/** The extensions' owned fields. Throws on a field that's a core key or claimed twice. */
export function ownedFields(core: readonly string[], infos: readonly Pick<ExtensionInfo, 'id' | 'fields'>[] = bundled()): OwnedField[] {
  const owner = new Map<string, string>();
  for (const e of infos) {
    for (const f of e.fields) {
      if (core.includes(f.key)) throw new Error(`extension '${e.id}' claims the core issue key '${f.key}'`);
      const other = owner.get(f.key);
      if (other) throw new Error(`extensions '${other}' and '${e.id}' both claim the issue key '${f.key}'`);
      owner.set(f.key, e.id);
    }
  }
  return infos.flatMap((e) => e.fields);
}

export type Enabled = Readonly<Record<ExtensionId, boolean>>;

export const settingsFile = (dir: string) => join(dir, 'settings.yaml');

const SWITCH: Record<string, boolean> = { on: true, true: true, off: false, false: false };

const allOn = (ids: readonly ExtensionId[]): Enabled => Object.fromEntries(ids.map((id) => [id, true]));

/** The `extensions:` map of a `settings.yaml` for the installed `ids`, each on unless it says off. Throws on a YAML error or a non-map. */
export function parseEnabled(src: string, ids: readonly ExtensionId[] = installedIds()): Enabled {
  const doc = parseDocument(src);
  if (doc.errors.length) throw doc.errors[0];
  const map = doc.get('extensions');
  if (map != null && !isMap(map)) throw new Error("settings.yaml: 'extensions' is not a map");
  const out: Record<ExtensionId, boolean> = { ...allOn(ids) };
  for (const id of ids) {
    const v = SWITCH[String(map?.get(id))];
    if (v !== undefined) out[id] = v;
  }
  return out;
}

const lastGood = new Map<string, { stamp: string; value: Enabled }>();

/**
 * Which installed extensions `<dir>/settings.yaml` switches on. Never throws: an unreadable or broken file keeps the
 * last good value, or turns every installed one on if there never was one. Takes the dir rather than calling
 * `dataDir()`, which creates folders.
 */
export function enabledExtensions(dir: string): Enabled {
  const file = settingsFile(dir);
  const last = lastGood.get(file);
  const ids = installedIds();
  try {
    let stamp = 'missing';
    try {
      const s = statSync(/*turbopackIgnore: true*/ file);
      stamp = `${s.mtimeMs}:${s.size}`;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    const key = `${stamp}|${ids.join()}`;
    if (last?.stamp === key) return last.value;
    const value = parseEnabled(stamp === 'missing' ? '' : readFileSync(/*turbopackIgnore: true*/ file, 'utf8'), ids);
    lastGood.set(file, { stamp: key, value });
    return value;
  } catch {
    return last?.value ?? allOn(ids);
  }
}

/** An extension is active while it's installed and either switched on or one of its sessions is attached (until that detaches). */
export function isActive(id: ExtensionId, dir?: string): boolean {
  if (!installedIds().includes(id)) return false;
  const data = dir ?? dataDir();
  return enabledExtensions(data)[id] || hasAttached(data, id);
}

/** The active manifests, in bundled order. Reads the settings, so only command handlers call it. */
export function activeManifests(dir?: string): ExtensionManifest[] {
  return MANIFESTS.filter((m) => isActive(m.id, dir));
}

/** The active extensions' owned fields: `add`'s and `edit`'s flags and `show`'s lines. */
export function activeFields(dir?: string): OwnedField[] {
  return bundled()
    .filter((e) => isActive(e.id, dir))
    .flatMap((e) => e.fields);
}

/** Extension `id`'s owned field values on an issue, by key; a field the issue doesn't set is absent. */
export function owned(issue: Pick<Issue, 'extra'>, id: ExtensionId): Partial<Record<string, string>> {
  const keys = new Set(extensionInfo(id)?.fields.map((f) => f.key));
  return Object.fromEntries((issue.extra ?? []).filter((e) => keys.has(String(e.key))).map((e) => [e.key, String(e.value)]));
}

/** An owned field's value from `add` or `edit`; an empty value clears it. */
export interface OwnedValue {
  field: OwnedField;
  value: string;
}

/** `options` plus a `--<key> <value>` option per owned field, which `fieldValues` reads. Throws on a field that would shadow an option. */
export function withFieldOptions<T extends NonNullable<ParseArgsConfig['options']>>(options: T, fields: readonly OwnedField[]): T {
  const out: NonNullable<ParseArgsConfig['options']> = { ...options };
  for (const f of fields) {
    if (f.key in out) throw new Error(`the owned field '${f.key}' clashes with the option --${f.key}`);
    out[f.key] = { type: 'string' };
  }
  return out as T;
}

export function fieldValues(values: Record<string, unknown>, fields: readonly OwnedField[]): OwnedValue[] {
  return fields.flatMap((field) => (typeof values[field.key] === 'string' ? [{ field, value: values[field.key] as string }] : []));
}

/** `belay show`'s lines for the issue's owned fields. */
export function fieldLines(issue: Pick<Issue, 'extra'>, fields: readonly OwnedField[]): string[] {
  return fields.flatMap((f) => {
    const e = issue.extra?.find((x) => x.key === f.key);
    return e && e.value != null && e.value !== '' ? [`${`${f.key}:`.padEnd(12)}${String(e.value)}`] : [];
  });
}

export function extensionId(s: string): ExtensionId {
  if (!isExtensionId(s)) throw new Error(`no extension '${s}' (bundled: ${bundled().map((e) => e.id).join(', ')})`);
  return s;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function portAnswers(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

export const ATTACHED_SCAN_MS = 2000;

const bridgePids = new Map<string, { at: number; stamp: string; pids: number[] }>();

/**
 * Whether a `bridge.json` under `id`'s session folder names a live pid. Synchronous, for `isActive`, so unlike
 * `attachedSessions` it doesn't ask the port. The pids are re-checked on every call, but the folder (hundreds of
 * grills) is scanned at most every `ATTACHED_SCAN_MS`, and the files re-read only when a session folder's mtime
 * changes, which a bridge.json appearing or going does.
 */
function hasAttached(dir: string, id: ExtensionId): boolean {
  const root = sessionsDir(id, dir);
  try {
    let cached = bridgePids.get(root);
    if (cached && Date.now() - cached.at < ATTACHED_SCAN_MS) return cached.pids.some(pidAlive);
    const slugs = readdirSync(/*turbopackIgnore: true*/ root);
    const stamp = slugs.map((s) => `${s}:${statSync(/*turbopackIgnore: true*/ join(root, s)).mtimeMs}`).join('|');
    if (cached?.stamp === stamp) cached.at = Date.now();
    else {
      const pids = slugs.flatMap((slug) => {
        try {
          const b = JSON.parse(readFileSync(/*turbopackIgnore: true*/ join(root, slug, 'bridge.json'), 'utf8'));
          return Number.isInteger(b?.pid) ? [b.pid as number] : [];
        } catch {
          return [];
        }
      });
      bridgePids.set(root, (cached = { at: Date.now(), stamp, pids }));
    }
    return cached.pids.some(pidAlive);
  } catch {
    return false;
  }
}

/** The slugs of `id`'s sessions with a bridge attached: a `bridge.json` whose pid is alive and whose port answers. */
export async function attachedSessions(dir: string, id: ExtensionId): Promise<string[]> {
  const root = sessionsDir(id, dir);
  if (!existsSync(root)) return [];
  const found = await Promise.all(
    readdirSync(root).map(async (slug) => {
      try {
        const b = JSON.parse(readFileSync(join(root, slug, 'bridge.json'), 'utf8'));
        return Number.isInteger(b?.pid) && Number.isInteger(b.port) && pidAlive(b.pid) && (await portAnswers(b.port)) ? slug : null;
      } catch {
        return null;
      }
    }),
  );
  return found.filter((s) => s !== null);
}
