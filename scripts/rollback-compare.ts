/**
 * Rollback check, pass condition: the working copy differs from the pristine one only by the ops' own edits.
 *   node scripts/rollback-compare.ts <working> <pristine> <ops log.json>
 * Compares Belay/ and Learning/ byte for byte, skipping `.git` and `Belay/cache/`. Every differing path must be one
 * the ops log lists as touched or may-touch. Prints the differences and exits 1 on any unexpected one.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { args } from './code.ts';

const { pos } = args();
if (pos.length !== 3) throw new Error('usage: rollback-compare.ts <working> <pristine> <ops log.json>');
const [working, pristine, logFile] = pos;
const log = JSON.parse(readFileSync(logFile, 'utf8')) as { touched: string[]; mayTouch: string[] };

const skip = (rel: string) => rel.endsWith('/.git') || rel === 'Belay/cache';
const img = (rel: string) => rel.replace(/\d{8}T\d{6}-[0-9a-f]{6}\.(png|jpg|gif|webp)$/, '<IMG>.$1');

function files(root: string, rel: string, out: Map<string, number>): void {
  let entries;
  try {
    entries = readdirSync(join(root, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const r = `${rel}/${e.name}`;
    if (skip(r)) continue;
    if (e.isDirectory()) files(root, r, out);
    else out.set(r, statSync(join(root, r)).size);
  }
}

const diffs: string[] = [];
for (const top of ['Belay', 'Learning']) {
  const a = new Map<string, number>();
  const b = new Map<string, number>();
  files(working, top, a);
  files(pristine, top, b);
  for (const rel of new Set([...a.keys(), ...b.keys()])) {
    if (!a.has(rel)) diffs.push(`D ${rel}`);
    else if (!b.has(rel)) diffs.push(`A ${rel}`);
    else if (a.get(rel) !== b.get(rel) || !readFileSync(join(working, rel)).equals(readFileSync(join(pristine, rel)))) diffs.push(`M ${rel}`);
  }
}

const allowed = new Set([...log.touched, ...log.mayTouch]);
const unexpected = diffs.filter((d) => !allowed.has(img(d.slice(2))));
for (const d of diffs.sort()) console.log(`${unexpected.includes(d) ? '!' : ' '} ${d}`);
console.log(`${diffs.length} differences, ${unexpected.length} unexpected`);
if (unexpected.length) process.exitCode = 1;
