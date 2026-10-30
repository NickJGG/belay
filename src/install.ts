/**
 * `belay extension install|uninstall <id>`: what makes a bundled extension Installed. Install runs, in order, a
 * filtered `pnpm install` (the root, web/ and the installed extensions' packages), the generator and
 * `claude plugin install <id>@belay`, and adds it to `extensions/installed.json` last, so a failed step leaves it
 * uninstalled and a rerun finishes it. Uninstall takes it off the record first, then runs the same steps backwards.
 * The process steps are injected (`InstallSteps`), so tests run neither pnpm nor claude. Nothing in the data dir
 * is touched.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { bundled, ID, installedFile, parseInstalled, type ExtensionId } from './extension-ids.ts';
import { attachedSessions } from './extensions.ts';
import { generate } from './generate.ts';
import { writeAtomic } from './store.ts';

export interface InstallSteps {
  /** A `pnpm install` in `root` with these arguments. */
  pnpm(root: string, args: readonly string[]): Promise<void>;
  /** Writes the generated files for `ids`. */
  generate(root: string, ids: readonly ExtensionId[]): void;
  /** Runs `claude` with these arguments; resolves with its stdout. */
  claude(args: readonly string[]): Promise<string>;
}

export const INSTALL_STEPS = ['dependencies', 'generated files', 'Claude Code plugin', 'record'] as const;
export const UNINSTALL_STEPS = ['record', 'Claude Code plugin', 'generated files', 'dependencies'] as const;
export type Step = (typeof INSTALL_STEPS)[number];

export interface InstallOptions {
  root: string;
  /** The data dir, read only for attached sessions. */
  data: string;
  steps: InstallSteps;
  /** Called as each step starts, 1-based. */
  onStep?: (step: Step, n: number, of: number) => void;
}

/** The record's ids, or none when there's no record. */
function recorded(root: string): ExtensionId[] {
  const file = installedFile(root);
  return existsSync(file) ? parseInstalled(readFileSync(file, 'utf8')) : [];
}

/** Adds or removes `id` in the record, re-read just before; false when it already said so. Keeps ids it doesn't know. */
export function setInstalled(root: string, id: ExtensionId, on: boolean): boolean {
  const ids = recorded(root);
  if (ids.includes(id) === on) return false;
  const next = on ? [...ids, id].sort() : ids.filter((x) => x !== id);
  writeAtomic(installedFile(root), `${JSON.stringify({ installed: next }, null, 2)}\n`);
  return true;
}

/** The bundled extensions among `ids`, in bundled order. */
const inBundled = (root: string, ids: readonly ExtensionId[]) =>
  bundled(root)
    .map((e) => e.id)
    .filter((x) => ids.includes(x));

/** `pnpm install`'s arguments for the root, web/ and the packages of `ids` that have one. */
export function pnpmArgs(root: string, ids: readonly ExtensionId[]): string[] {
  const dirs = ['.', './web', ...ids.filter((id) => existsSync(join(root, 'extensions', id, 'package.json'))).map((id) => `./extensions/${id}`)];
  return ['install', ...dirs.flatMap((d) => ['--filter', d])];
}

const pluginOf = (root: string, id: ExtensionId) => existsSync(join(root, 'extensions', id, 'plugin', '.claude-plugin', 'plugin.json'));

interface ListedPlugin {
  id: string;
  version?: string;
  folderVersion?: string;
}

async function plugins(steps: InstallSteps): Promise<ListedPlugin[]> {
  const out = await steps.claude(['plugin', 'list', '--json']);
  try {
    const list = JSON.parse(out);
    if (Array.isArray(list)) return list;
  } catch {}
  throw new Error("'claude plugin list --json' didn't print a list");
}

function check(root: string, id: ExtensionId): void {
  if (!ID.test(id) || !bundled(root).some((e) => e.id === id)) throw new Error(`no extension '${id}' (bundled: ${bundled(root).map((e) => e.id).join(', ')})`);
}

async function run(steps: readonly Step[], o: InstallOptions, todo: Record<Step, () => unknown>): Promise<void> {
  for (const [i, step] of steps.entries()) {
    o.onStep?.(step, i + 1, steps.length);
    try {
      await todo[step]();
    } catch (e) {
      throw new Error(`${step}: ${(e as Error).message}`);
    }
  }
}

/** Installs bundled extension `id`; false when it was already installed (the steps still run, finishing an earlier try). */
export async function installExtension(id: ExtensionId, o: InstallOptions): Promise<boolean> {
  check(o.root, id);
  const ids = inBundled(o.root, [...recorded(o.root), id]);
  let changed = false;
  await run(INSTALL_STEPS, o, {
    dependencies: () => o.steps.pnpm(o.root, pnpmArgs(o.root, ids)),
    'generated files': () => o.steps.generate(o.root, ids),
    'Claude Code plugin': async () => {
      if (!pluginOf(o.root, id)) return;
      const listed = await plugins(o.steps);
      if (!listed.some((p) => p.id === `${id}@belay`)) await o.steps.claude(['plugin', 'install', `${id}@belay`]);
      // Its compiled bridge ships in the core plugin, which Claude Code runs from a cached copy.
      const core = listed.find((p) => p.id === 'belay@belay');
      if (core?.folderVersion && core.version !== core.folderVersion) await o.steps.claude(['plugin', 'update', 'belay@belay']);
    },
    record: () => (changed = setInstalled(o.root, id, true)),
  });
  return changed;
}

/**
 * Uninstalls bundled extension `id`, refused while one of its sessions is attached; false when it wasn't installed
 * (the steps still run). Its `settings.yaml` switch and its data stay.
 */
export async function uninstallExtension(id: ExtensionId, o: InstallOptions): Promise<boolean> {
  check(o.root, id);
  const live = await attachedSessions(o.data, id, o.root);
  if (live.length) throw new Error(`a ${id} session is attached (${live.join(', ')}): uninstall ${id} once it detaches`);
  const ids = inBundled(o.root, recorded(o.root).filter((x) => x !== id));
  let changed = false;
  await run(UNINSTALL_STEPS, o, {
    record: () => (changed = setInstalled(o.root, id, false)),
    'Claude Code plugin': async () => {
      // Without --keep-data, claude also deletes the plugin's ~/.claude/plugins/data/ folder.
      if (pluginOf(o.root, id) && (await plugins(o.steps)).some((p) => p.id === `${id}@belay`)) await o.steps.claude(['plugin', 'uninstall', `${id}@belay`, '--keep-data']);
    },
    'generated files': () => {
      o.steps.generate(o.root, ids);
      // `next dev`'s route types still name the removed routes, which fails the next build.
      rmSync(join(o.root, 'web', '.next', 'dev', 'types'), { recursive: true, force: true });
    },
    dependencies: () => o.steps.pnpm(o.root, pnpmArgs(o.root, ids)),
  });
  return changed;
}

/** Runs `cmd`, failing with the tail of its output. */
function exec(cmd: string, args: readonly string[], cwd: string, shell: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    // Node deprecates passing args alongside `shell`, since it only concatenates them; do that here instead.
    const [file, argv] = shell ? [[cmd, ...args].join(' '), []] : [cmd, args];
    const child = spawn(file, argv, { cwd, shell, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(new Error((e as NodeJS.ErrnoException).code === 'ENOENT' ? `can't run ${cmd}: is it installed and on PATH?` : e.message)));
    child.on('exit', (code) => {
      if (code === 0) return resolve(out);
      const tail = `${err}${out}`.trim().split('\n').slice(-8).join('\n');
      reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}${tail ? `:\n${tail}` : ''}`));
    });
  });
}

export const realSteps: InstallSteps = {
  // pnpm is a .cmd shim on Windows, which only a shell runs; the arguments are fixed words and validated ids.
  pnpm: async (root, args) => void (await exec('pnpm', args, root, process.platform === 'win32')),
  generate: (root, ids) => void generate(root, ids),
  claude: (args) => exec('claude', args, process.cwd(), false),
};
