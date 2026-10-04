import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Resolves the data dir from `TRACKER_DATA` (default `~/Tracker`) and ensures its subfolders exist. */
export function dataDir(): string {
  const dir = resolve(/*turbopackIgnore: true*/ process.env.TRACKER_DATA || join(homedir(), 'Tracker'));
  mkdirSync(join(dir, 'projects'), { recursive: true });
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  return dir;
}

/** Claude Code's config dir: `CLAUDE_CONFIG_DIR` (default `~/.claude`). */
export function claudeDir(): string {
  return resolve(/*turbopackIgnore: true*/ process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'));
}
