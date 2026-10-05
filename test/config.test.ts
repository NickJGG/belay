import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { dataDir } from '../src/config.ts';

let dir: string;
let saved: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tracker-'));
  saved = process.env.TRACKER_DATA;
  process.env.TRACKER_DATA = dir;
});

afterEach(() => {
  if (saved === undefined) delete process.env.TRACKER_DATA;
  else process.env.TRACKER_DATA = saved;
  rmSync(dir, { recursive: true, force: true });
});

test('dataDir creates projects/ and issues/', () => {
  assert.equal(dataDir(), dir);
  assert.ok(existsSync(join(dir, 'projects')));
  assert.ok(existsSync(join(dir, 'issues')));
});

test('dataDir refuses a data dir that still has tasks/', () => {
  mkdirSync(join(dir, 'tasks'));
  assert.throws(() => dataDir(), { message: `rename tasks/ to issues/ in ${dir}` });
  assert.ok(!existsSync(join(dir, 'issues')));
});

test('dataDir ignores a leftover tasks/ once issues/ exists', () => {
  mkdirSync(join(dir, 'tasks'));
  mkdirSync(join(dir, 'issues'));
  assert.equal(dataDir(), dir);
});
