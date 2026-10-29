import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { extensionInfo, type ExtensionId } from './extension-ids.ts';

/**
 * Resolves the data dir from `BELAY_DATA` (default `~/Belay`) and ensures its subfolders exist.
 * Throws on a data dir from before issues were called tasks, rather than starting an empty `issues/`.
 */
export function dataDir(): string {
  const dir = resolve(/*turbopackIgnore: true*/ process.env.BELAY_DATA || join(homedir(), 'Belay'));
  if (existsSync(join(dir, 'tasks')) && !existsSync(join(dir, 'issues'))) throw new Error(`rename tasks/ to issues/ in ${dir}`);
  mkdirSync(join(dir, 'projects'), { recursive: true });
  mkdirSync(join(dir, 'issues'), { recursive: true });
  return dir;
}

/** Claude Code's config dir: `CLAUDE_CONFIG_DIR` (default `~/.claude`). */
export function claudeDir(): string {
  return resolve(/*turbopackIgnore: true*/ process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'));
}

/** Extension `id`'s sessions: `<dataDir>/<its belay.json's sessions>/<slug>/`. */
export function sessionsDir(id: ExtensionId, dir = dataDir()): string {
  const info = extensionInfo(id);
  if (!info) throw new Error(`no extension '${id}'`);
  return join(dir, info.sessions);
}

/** The lesson start queue and restart marker. */
export const runDir = (dir = dataDir()) => join(dir, '.run');

/** `belay serve`'s port unless `--port` overrides it. */
export const DEFAULT_PORT = 4747;
