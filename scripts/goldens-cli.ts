/**
 * CLI goldens: runs read commands through a code root's CLI and writes their normalised output, one file each.
 *   test-env.sh <working> node scripts/goldens-cli.ts <code root> --out <dir> [--paths <json>]
 * Diff two output dirs (master and branch, same working copy) with `diff -r`. Pins CLAUDE_CONFIG_DIR to the working
 * copy's fixture `claude/`, for the digest only.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { args, code, need, normaliser } from './code.ts';

const { pos, flags } = args();
if (pos.length !== 1 || typeof flags.out !== 'string') throw new Error('usage: goldens-cli.ts <code root> --out <dir> [--paths <json>]');
const c = code(pos[0], flags.paths as string | undefined);
const working = dirname(need('BELAY_DATA'));
const norm = normaliser(working);
const out = flags.out;
mkdirSync(out, { recursive: true });

const env: Record<string, string | undefined> = { ...process.env, CLAUDE_CONFIG_DIR: join(working, 'claude') };
for (const k of Object.keys(env)) if (k.startsWith('CLAUDE') && k !== 'CLAUDE_CONFIG_DIR') delete env[k];

const BEL = 'C:/Users/Nick/Projects/Tools/belay';
const hook = (source: string) => JSON.stringify({ cwd: BEL, session_id: 'golden', source });

const runs: [string, string[], string?][] = [
  ['help', ['help']],
  ['digest', ['digest'], hook('startup')],
  ['digest-compact', ['digest'], hook('compact')],
  ['show-grill', ['show', 'BEL-88']],
  ['show-fixture', ['show', 'FXT-1']],
  ['search-words', ['search', 'extension', 'grill']],
  ['search-plugin', ['search', 'plugin']],
  ['list', ['list']],
  ['list-all-fxt', ['list', '--project', 'FXT', '--status', 'all']],
  ['list-bel-updated', ['list', '--project', 'BEL', '--status', 'all', '--sort', 'updated']],
  ['next', ['next', '--all']],
  ['project-list', ['project', 'list', '--all']],
];

for (const [name, argv, input] of runs) {
  const r = spawnSync(process.execPath, [c.path('cli'), ...argv], { encoding: 'utf8', env, input: input ?? '', cwd: tmpdir() });
  const stderr = r.stderr.replace(/\(node:\d+\) \[TAG_RESOLVE_FAILED\][\s\S]*?--trace-warnings[^\n]*\n/g, '');
  writeFileSync(join(out, `${name}.txt`), norm(`$ belay ${argv.join(' ')}\nexit ${r.status}\n${r.stdout}${stderr ? `--- stderr\n${stderr}` : ''}`));
}
console.log(`${runs.length} goldens in ${out}`);
