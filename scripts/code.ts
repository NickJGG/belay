/**
 * Loads a code root's modules by dynamic import, so one frozen copy of these scripts can drive master and the branch.
 * Module paths move in later phases: `--paths <json>` maps a module name to its path under the root.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_PATHS: Record<string, string> = {
  store: 'src/store.ts',
  ops: 'src/ops.ts',
  config: 'src/config.ts',
  cli: 'src/cli.ts',
  work: 'web/src/lib/work.ts',
  courses: 'web/src/lib/courses.ts',
  startQueue: 'web/src/lib/start-queue.ts',
  images: 'web/src/lib/images.ts',
  shell: 'web/src/lib/shell.ts',
  sidebar: 'web/src/lib/sidebar.ts',
  webConfig: 'web/src/lib/config.ts',
  bridgePost: 'web/src/lib/bridge-post.ts',
  upstream: 'web/src/lib/upstream.ts',
  chat: 'web/src/lib/chat.ts',
  sessions: 'web/src/lib/sessions.ts',
};

export interface Code {
  root: string;
  path(name: string): string;
  load<T = any>(name: string): Promise<T>;
  /** The root's own `yaml`, so values parse the way that root parses them. */
  yaml(): typeof import('yaml');
}

export function code(root: string, pathsFile?: string): Code {
  const abs = resolve(root);
  const paths = { ...DEFAULT_PATHS, ...(pathsFile ? JSON.parse(readFileSync(pathsFile, 'utf8')) : {}) };
  const path = (name: string) => {
    if (!paths[name]) throw new Error(`no path for module '${name}'`);
    return join(abs, paths[name]);
  };
  return {
    root: abs,
    path,
    load: (name) => import(pathToFileURL(path(name)).href),
    yaml: () => createRequire(join(abs, 'package.json'))('yaml'),
  };
}

/** `<root> [--flag value | --flag]...`: positionals in order, then flags. */
export function args(argv = process.argv.slice(2)): { pos: string[]; flags: Record<string, string | true> } {
  const pos: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) pos.push(a);
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[a.slice(2)] = argv[++i];
    else flags[a.slice(2)] = true;
  }
  return { pos, flags };
}

export function need(env: string): string {
  const v = process.env[env];
  if (!v) throw new Error(`${env} is not set: run through scripts/test-env.sh`);
  return v;
}

/**
 * Masks what differs between two runs of the same code: today's times, image names, epoch stamps, the temp dir and
 * the working copy's path. A run that spans midnight can still differ.
 */
export function normaliser(working: string): (s: string) => string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const slashed = (p: string) => p.replaceAll('\\', '/');
  return (s) =>
    s
      .replaceAll(new RegExp(`${today}[T ]\\d\\d:\\d\\d`, 'g'), '<NOW>')
      .replaceAll(today, '<TODAY>')
      .replace(/\d{8}T\d{6}-[0-9a-f]{6}\.(png|jpg|gif|webp)/g, '<IMG>.$1')
      .replace(/"at":\d{13}/g, '"at":<MS>')
      .replace(/\b\d+(?:m|h|min|mins|hours?|minutes?) ago\b/g, '<AGO>')
      .replaceAll(slashed(tmpdir()), '<TMP>')
      .replaceAll(slashed(working), '<WORKING>');
}
