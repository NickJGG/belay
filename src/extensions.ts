/**
 * The CLI's built-in extension list, the reader for `settings.yaml`'s `extensions:` map, and `isActive`. Imports only
 * types from store.ts, which imports it for the known issue keys.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ParseArgsConfig } from 'node:util';
import { isMap, parseDocument } from 'yaml';
import { dataDir, grillsDir, lessonsDir } from './config.ts';
import { BUILT_IN, EXTENSION_IDS, isExtensionId, type ExtensionId } from './extension-ids.ts';
import { manifest as grill } from './extensions/grill/manifest.ts';
import { manifest as learn } from './extensions/learn/manifest.ts';
import type { Issue, Project } from './store.ts';

/** An issue frontmatter key an extension owns, saved right after `after`. */
export interface OwnedField {
  key: string;
  after: string;
}

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
  help?: CliHelp;
}

export interface ExtensionManifest {
  id: ExtensionId;
  fields: readonly OwnedField[];
  /** Its Claude Code skills, which stay installed while it's off. */
  skills: readonly string[];
  cli?: CliSlots;
}

export const MANIFESTS: readonly ExtensionManifest[] = [grill, learn];

/** Every manifest's owned fields. Throws on a field that's a core key or claimed twice. */
export function ownedFields(core: readonly string[], manifests = MANIFESTS): OwnedField[] {
  const owner = new Map<string, string>();
  for (const m of manifests) {
    for (const f of m.fields) {
      if (core.includes(f.key)) throw new Error(`extension '${m.id}' claims the core issue key '${f.key}'`);
      const other = owner.get(f.key);
      if (other) throw new Error(`extensions '${other}' and '${m.id}' both claim the issue key '${f.key}'`);
      owner.set(f.key, m.id);
    }
  }
  return manifests.flatMap((m) => m.fields);
}

export type Enabled = Readonly<Record<ExtensionId, boolean>>;

export const settingsFile = (dir: string) => join(dir, 'settings.yaml');

const SWITCH: Record<string, boolean> = { on: true, true: true, off: false, false: false };

/** The `extensions:` map of a `settings.yaml`, over the built-in defaults. Throws on a YAML error or a non-map. */
export function parseEnabled(src: string): Enabled {
  const doc = parseDocument(src);
  if (doc.errors.length) throw doc.errors[0];
  const map = doc.get('extensions');
  if (map != null && !isMap(map)) throw new Error("settings.yaml: 'extensions' is not a map");
  const out = { ...BUILT_IN };
  for (const id of EXTENSION_IDS) {
    const v = SWITCH[String(map?.get(id))];
    if (v !== undefined) out[id] = v;
  }
  return out;
}

const ALL_ON: Enabled = Object.fromEntries(EXTENSION_IDS.map((id) => [id, true])) as Record<ExtensionId, boolean>;
const lastGood = new Map<string, { stamp: string; value: Enabled }>();

/**
 * Which extensions `<dir>/settings.yaml` switches on. Never throws: an unreadable or broken file keeps the last good
 * value, or turns every built-in on if there never was one. Takes the dir rather than calling `dataDir()`, which
 * creates folders.
 */
export function enabledExtensions(dir: string): Enabled {
  const file = settingsFile(dir);
  const last = lastGood.get(file);
  try {
    let stamp = 'missing';
    try {
      const s = statSync(/*turbopackIgnore: true*/ file);
      stamp = `${s.mtimeMs}:${s.size}`;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    if (last?.stamp === stamp) return last.value;
    const value = stamp === 'missing' ? { ...BUILT_IN } : parseEnabled(readFileSync(/*turbopackIgnore: true*/ file, 'utf8'));
    lastGood.set(file, { stamp, value });
    return value;
  } catch {
    return last?.value ?? ALL_ON;
  }
}

/** Extensions whose switch takes effect; the rest are active whatever the settings say. */
const GATED: ReadonlySet<ExtensionId> = new Set(['learn']);

/** An extension is active while it's switched on, or while one of its sessions is attached (until that detaches). */
export function isActive(id: ExtensionId, dir?: string): boolean {
  if (!GATED.has(id)) return true;
  const data = dir ?? dataDir();
  return enabledExtensions(data)[id] || hasAttached(data, id);
}

/** The active manifests, in built-in order. Reads the settings, so only command handlers call it. */
export function activeManifests(dir?: string): ExtensionManifest[] {
  return MANIFESTS.filter((m) => isActive(m.id, dir));
}

/** An owned field's value from `add` or `edit`; an empty value clears it. */
export interface OwnedValue {
  field: OwnedField;
  value: string;
}

/** `options` plus a `--<key> <value>` option per owned field, which `fieldValues` reads. Throws on a field that would shadow an option. */
export function withFieldOptions<T extends NonNullable<ParseArgsConfig['options']>>(options: T, manifests: readonly ExtensionManifest[]): T {
  const out: NonNullable<ParseArgsConfig['options']> = { ...options };
  for (const f of manifests.flatMap((m) => m.fields)) {
    if (f.key in out) throw new Error(`the owned field '${f.key}' clashes with the option --${f.key}`);
    out[f.key] = { type: 'string' };
  }
  return out as T;
}

export function fieldValues(values: Record<string, unknown>, manifests: readonly ExtensionManifest[]): OwnedValue[] {
  return manifests.flatMap((m) => m.fields).flatMap((field) => (typeof values[field.key] === 'string' ? [{ field, value: values[field.key] as string }] : []));
}

/** `belay show`'s lines for the issue's owned fields. */
export function fieldLines(issue: Pick<Issue, 'extra'>, manifests: readonly ExtensionManifest[]): string[] {
  return manifests
    .flatMap((m) => m.fields)
    .flatMap((f) => {
      const e = issue.extra?.find((x) => x.key === f.key);
      return e && e.value != null && e.value !== '' ? [`${`${f.key}:`.padEnd(12)}${String(e.value)}`] : [];
    });
}

export function extensionId(s: string): ExtensionId {
  if (!isExtensionId(s)) throw new Error(`no extension '${s}' (built in: ${EXTENSION_IDS.join(', ')})`);
  return s;
}

const SESSION_ROOTS: Record<ExtensionId, (dir: string) => string> = { grill: grillsDir, learn: lessonsDir };

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

const bridgePids = new Map<string, { stamp: string; pids: number[] }>();

/**
 * Whether a `bridge.json` under `id`'s session folder names a live pid. Synchronous, for `isActive`, so unlike
 * `attachedSessions` it doesn't ask the port. The files are re-read only when a session folder's mtime changes, which a
 * bridge.json appearing or going does.
 */
function hasAttached(dir: string, id: ExtensionId): boolean {
  const root = SESSION_ROOTS[id](dir);
  try {
    const slugs = readdirSync(/*turbopackIgnore: true*/ root);
    const stamp = slugs.map((s) => `${s}:${statSync(/*turbopackIgnore: true*/ join(root, s)).mtimeMs}`).join('|');
    let cached = bridgePids.get(root);
    if (cached?.stamp !== stamp) {
      const pids = slugs.flatMap((slug) => {
        try {
          const b = JSON.parse(readFileSync(/*turbopackIgnore: true*/ join(root, slug, 'bridge.json'), 'utf8'));
          return Number.isInteger(b?.pid) ? [b.pid as number] : [];
        } catch {
          return [];
        }
      });
      bridgePids.set(root, (cached = { stamp, pids }));
    }
    return cached.pids.some(pidAlive);
  } catch {
    return false;
  }
}

/** The slugs of `id`'s sessions with a bridge attached: a `bridge.json` whose pid is alive and whose port answers. */
export async function attachedSessions(dir: string, id: ExtensionId): Promise<string[]> {
  const root = SESSION_ROOTS[id](dir);
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
