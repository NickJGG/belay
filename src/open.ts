/** Opening an issue's own file, or a file an active extension links it to, in the OS default app. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { activeManifests, type ExtensionManifest } from './extensions.ts';
import { issueFile, type Issue } from './store.ts';

/** `file`, then the active extensions' kinds (grill's `grill` and `plan`). */
export function linkedKinds(manifests: readonly ExtensionManifest[]): string[] {
  return ['file', ...manifests.flatMap((m) => Object.keys(m.cli?.linked ?? {}))];
}

/** Absolute path of the issue's file of that kind, or undefined when it has none. Throws on a kind no active extension offers. */
export async function linkedPath(
  issue: Issue,
  kind: string,
  data: string,
  manifests: readonly ExtensionManifest[] = activeManifests(data),
): Promise<string | undefined> {
  if (kind === 'file') return issueFile(data, issue.id);
  const path = manifests.find((m) => m.cli?.linked?.[kind])?.cli?.linked?.[kind];
  if (!path) throw new Error(`kind must be ${linkedKinds(manifests).join('|')}`);
  return path(issue, data);
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
