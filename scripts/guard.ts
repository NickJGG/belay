/**
 * Tripwire for test runs, loaded into every Node process via `NODE_OPTIONS=--import=…/guard.ts` (see `test-env.sh`).
 * Throws unless `BELAY_DATA` and `LEARNING_ROOT` are set and resolve outside the real `~/Belay` and `~/Learning`,
 * because an unset env silently falls back to the real dirs. Each firing is appended to `tripwireLog()`.
 */
import { appendFileSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

/** Pinned by `test-env.sh`, so a child that fakes `USERPROFILE` (the bridge harness) still guards the real dirs. */
const home = () => process.env.BELAY_GUARD_HOME || homedir();

export const tripwireLog = () => join(tmpdir(), 'belay-tripwire.log');

function canonical(p: string): string {
  let out = resolve(p);
  try {
    out = realpathSync.native(out);
  } catch {
    // not created yet
  }
  return process.platform === 'win32' ? out.toLowerCase() : out;
}

const within = (p: string, root: string) => {
  const rel = relative(root, p);
  return !rel.startsWith('..') && !isAbsolute(rel);
};

/** Why this env would touch real data, or undefined when it's safe. */
export function unsafe(env: Record<string, string | undefined> = process.env): string | undefined {
  const pairs: [string, string][] = [
    ['BELAY_DATA', 'Belay'],
    ['LEARNING_ROOT', 'Learning'],
  ];
  for (const [name, real] of pairs) {
    const v = env[name];
    if (!v) return `${name} is not set`;
    const realDir = canonical(join(home(), real));
    const dir = canonical(v);
    if (within(dir, realDir) || within(realDir, dir)) return `${name}=${v} overlaps the real ${realDir}`;
  }
  return undefined;
}

const reason = unsafe();
if (reason) {
  const line = `${new Date().toISOString()} pid ${process.pid} [${process.argv.slice(1).join(' ')}]: ${reason}\n`;
  try {
    appendFileSync(tripwireLog(), line);
  } catch {
    // the throw below still stops the process
  }
  throw new Error(`belay test guard: ${reason}`);
}
