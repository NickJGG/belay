/**
 * Version history for the data dir: when `<dir>/.git` exists, every op commits the files it wrote (see `Ctx.record`).
 * Only ever adds commits; never amends, resets, rebases, checks out or pushes.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { grillsDir } from './config.ts';
import { grillStatus, isGrillSlug } from './grill.ts';

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

/**
 * Commits a finished grill's folder, `grill <slug> - <by>`. Only a `planned` grill: one still in progress or
 * abandoned stays out of history. Checks the grill even when the data dir has no history, then does nothing.
 */
export function commitGrill(dir: string, slug: string, author: { by: string; session?: string }): 'committed' | 'unchanged' | 'no history' {
  if (!isGrillSlug(slug)) throw new Error(`'${slug}' is not a grill slug`);
  const folder = join(grillsDir(dir), slug);
  if (!existsSync(folder)) throw new Error(`no grill '${slug}' in ${grillsDir(dir)}`);
  const status = grillStatus(grillsDir(dir), slug);
  if (status !== 'planned') throw new Error(`grill '${slug}' is ${status ?? 'without a status'}; only a planned grill is committed`);
  if (!hasHistory(dir)) return 'no history';
  // A bridge's token stays out even in a data dir whose .gitignore predates grills/. The wildcard matters: git refuses
  // a pathspec that literally names an ignored file, exclude or not.
  const paths = [folder, `:(exclude)grills/${slug}/bridge.*`];
  if (!hasChanges(dir, paths)) return 'unchanged';
  commitPathsOrThrow(dir, paths, `grill ${slug} - ${author.by}`, author.session && `Session: ${author.session}`);
  return 'committed';
}

export const GITIGNORE = 'cache/\n.run/\nlessons/\ngrills/*/bridge.json\n';

export function initHistory(dir: string): void {
  if (hasHistory(dir)) throw new Error(`${dir} already has git history`);
  gitOrThrow(dir, ['init', '-q']);
  const ignore = join(dir, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, GITIGNORE);
  gitOrThrow(dir, ['add', '-A']);
  gitOrThrow(dir, ['commit', '-q', '-m', 'init - user']);
}
