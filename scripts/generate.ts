/**
 * Writes the site's generated files from the Installed extensions (`src/generate.ts`).
 *   node scripts/generate.ts                  once
 *   node scripts/generate.ts --watch <cmd…>   then runs <cmd> (web/'s `pnpm dev`), regenerating on every change
 *                                             under extensions/ until it exits. <cmd> is spawned without a shell, so
 *                                             it can't be a .cmd shim; `node` means this Node.
 */
import { spawn } from 'node:child_process';
import { describe, generate, watchExtensions } from '../src/generate.ts';

const line = describe(generate());
if (line) console.log(line);

const at = process.argv.indexOf('--watch');
if (at >= 0) {
  const cmd = process.argv.slice(at + 1);
  if (!cmd.length) throw new Error('--watch needs a command to run');
  const stop = watchExtensions();
  const child = spawn(cmd[0] === 'node' ? process.execPath : cmd[0], cmd.slice(1), { stdio: 'inherit' });
  child.on('exit', (code) => {
    stop();
    process.exit(code ?? 0);
  });
}
