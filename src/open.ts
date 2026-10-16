/** Opening an issue's own file, grill session or plan in the OS default app. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { grillFile } from './grill.ts';
import { issueFile, type Issue } from './store.ts';

export type Linked = 'file' | 'grill' | 'plan';

export const isLinked = (v: unknown): v is Linked => v === 'file' || v === 'grill' || v === 'plan';

/** Absolute path of the issue's file, grill session or plan, or undefined when it has none. */
export function linkedPath(
  issue: Pick<Issue, 'id' | 'grill' | 'plan'>,
  kind: Linked,
  dirs: { data: string; claude: string },
): string | undefined {
  if (kind === 'file') return issueFile(dirs.data, issue.id);
  if (kind === 'grill') return issue.grill ? grillFile(dirs.claude, issue.grill) : undefined;
  return issue.plan ? resolve(issue.plan) : undefined;
}

export function openFile(path: string): void {
  if (!existsSync(path)) throw new Error(`${path} doesn't exist`);
  // explorer rather than `cmd /c start`, which would parse `&` and the like in the path.
  const [cmd, args] =
    process.platform === 'win32' ? ['explorer', [path]] : process.platform === 'darwin' ? ['open', [path]] : ['xdg-open', [path]];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}
