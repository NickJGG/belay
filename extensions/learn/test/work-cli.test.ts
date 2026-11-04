import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { cmdWork } from '../cli/work.ts';

let dir: string;
let out: string[];
const log = console.log;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'belay-work-'));
  out = [];
  console.log = (s: string) => out.push(s);
});
afterEach(() => {
  console.log = log;
  rmSync(dir, { recursive: true, force: true });
});

const SPEC = 'Arrows:\n  Client -> API "http"\n';
const stdin = (s: string) => async () => s;

test('write then read prints the spec back under a header', async () => {
  const file = join(dir, 'sub', 'x.excalidraw');
  await cmdWork(['write', file], stdin(SPEC));
  assert.equal(out[0], `wrote ${file}`);
  await cmdWork(['read', file]);
  assert.equal(out[1], `${file} · 6 elements: 2 boxes, 1 arrow, 3 labels · all read\nBoxes:\n  Client\n  API\nArrows:\n  Client → API "http"`);
});

test('write refuses an existing file without --force', async () => {
  const file = join(dir, 'x.excalidraw');
  await cmdWork(['write', file], stdin(SPEC));
  await assert.rejects(cmdWork(['write', file], stdin('A -> B')), /exists \(--force replaces it\)/);
  await cmdWork(['write', file, '--force'], stdin('A -> B'));
  assert.match(readFileSync(file, 'utf8'), /"source": "belay"/);
});

test('read prints a file without a summary as it is; write refuses formats without one', async () => {
  const file = join(dir, 'notes.md');
  writeFileSync(file, '# Notes\nhi\n');
  await cmdWork(['read', file]);
  assert.equal(out[0], '# Notes\nhi');
  await assert.rejects(cmdWork(['write', file], stdin(SPEC)), /Text files can't be written from a spec/);
});

test('argument errors', async () => {
  await assert.rejects(cmdWork([]), /expected read or write/);
  await assert.rejects(cmdWork(['draw', 'x']), /expected read or write, got 'draw'/);
  await assert.rejects(cmdWork(['read']), /expected 1 argument/);
  await assert.rejects(cmdWork(['write', join(dir, 'y.excalidraw')], stdin('Arrows:\n  A -> ?')), /both ends/);
});
