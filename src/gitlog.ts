/**
 * Version history for the data dir: when `<dir>/.git` exists, every op commits the files it wrote (see `Ctx.record`).
 * Only ever adds commits; never amends, resets, rebases, checks out or pushes.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { bundled, type ExtensionInfo } from './extension-ids.ts';

/** stdout, or `undefined` when git fails or isn't installed. */
export function git(dir: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
}

/** Like `git`, but throws with git's first line of output. */
function gitOrThrow(dir: string, args: string[]): void {
  try {
    execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const { stderr, stdout, message } = e as { stderr?: string; stdout?: string; message: string };
    const line = [stderr, stdout, message].flatMap((s) => (s ?? '').split('\n')).find((l) => l.trim());
    throw new Error(`git ${args[0]}: ${line?.trim()}`);
  }
}

export function hasHistory(dir: string): boolean {
  return existsSync(join(dir, '.git'));
}

/**
 * Pathspecs relative to the data dir, so git never sees a drive-letter path. `paths` are absolute, inside `dir`,
 * or magic pathspecs (`:(exclude)grills/x/bridge.*`), already relative, which pass through.
 */
const pathspecs = (dir: string, paths: string[]) => paths.map((p) => (p.startsWith(':') ? p : relative(dir, p).replaceAll('\\', '/')));

/** Whether git sees any change under `paths` (see `pathspecs`), untracked files included. */
export function hasChanges(dir: string, paths: string[]): boolean {
  return !!git(dir, ['status', '--porcelain', '--', ...pathspecs(dir, paths)])?.trim();
}

/** Commits `paths` alone, whatever else is staged or untracked. Throws with git's first line. */
export function commitPathsOrThrow(dir: string, paths: string[], subject: string, body?: string): void {
  const specs = pathspecs(dir, paths);
  gitOrThrow(dir, ['add', '-A', '--', ...specs]);
  gitOrThrow(dir, ['commit', '-q', '-m', subject, ...(body ? ['-m', body] : []), '--', ...specs]);
}

/** Best-effort: a failure goes to stderr as one line and never fails the op that wrote the files. */
export function commitPaths(dir: string, paths: string[], subject: string, body?: string): void {
  if (!paths.length || !hasHistory(dir)) return;
  try {
    commitPathsOrThrow(dir, paths, subject, body);
  } catch (e) {
    console.error(`belay: history not committed: ${(e as Error).message}`);
  }
}

/** The data dir's `.gitignore`. An extension's sessions stay out of the history whole, or, if it keeps them there, only their `bridge.json`. */
export function gitignore(infos: readonly ExtensionInfo[] = bundled()): string {
  const untracked = infos.filter((e) => !e.history).map((e) => `${e.sessions}/`);
  const tracked = infos.filter((e) => e.history).map((e) => `${e.sessions}/*/bridge.json`);
  return ['cache/', '.run/', ...untracked, ...tracked].map((l) => `${l}\n`).join('');
}

export function initHistory(dir: string): void {
  if (hasHistory(dir)) throw new Error(`${dir} already has git history`);
  gitOrThrow(dir, ['init', '-q']);
  const ignore = join(dir, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, gitignore());
  gitOrThrow(dir, ['add', '-A']);
  gitOrThrow(dir, ['commit', '-q', '-m', 'init - user']);
}
