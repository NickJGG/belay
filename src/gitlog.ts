/**
 * Version history for the data dir: when `<dir>/.git` exists, every op commits its files (see `Ctx.record`).
 * Only ever adds commits; never amends, resets, rebases, checks out or pushes.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

/** Best-effort: a failure goes to stderr as one line and never fails the op that wrote the files. */
export function commitAll(dir: string, subject: string, body?: string): void {
  if (!hasHistory(dir)) return;
  try {
    gitOrThrow(dir, ['add', '-A']);
    gitOrThrow(dir, ['commit', '-q', '-m', subject, ...(body ? ['-m', body] : [])]);
  } catch (e) {
    console.error(`belay: history not committed: ${(e as Error).message}`);
  }
}

export function initHistory(dir: string): void {
  if (hasHistory(dir)) throw new Error(`${dir} already has git history`);
  gitOrThrow(dir, ['init', '-q']);
  const ignore = join(dir, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, 'cache/\n');
  gitOrThrow(dir, ['add', '-A']);
  gitOrThrow(dir, ['commit', '-q', '-m', 'init - user']);
}
