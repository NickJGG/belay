import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { buildStale } from '../src/web.ts';

let root: string;

function touch(rel: string, secondsAgo: number): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '');
  const t = Date.now() / 1000 - secondsAgo;
  utimesSync(path, t, t);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'belay-'));
  touch('src/cli.ts', 100);
  touch('web/app/page.tsx', 100);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

test('stale without a build', () => {
  assert.equal(buildStale(root), true);
});

test('fresh when the build is newer than every source', () => {
  touch('web/.next/BUILD_ID', 50);
  assert.equal(buildStale(root), false);
});

test('a newer file in web/ or src/ makes it stale', () => {
  touch('web/.next/BUILD_ID', 50);
  touch('web/components/Board.tsx', 10);
  assert.equal(buildStale(root), true);

  touch('web/components/Board.tsx', 100);
  touch('src/ops.ts', 10);
  assert.equal(buildStale(root), true);
});

test('generated files and dependencies are ignored', () => {
  touch('web/.next/BUILD_ID', 50);
  touch('web/.next/cache/x', 10);
  touch('web/node_modules/next/package.json', 10);
  touch('web/next-env.d.ts', 10);
  touch('web/tsconfig.tsbuildinfo', 10);
  assert.equal(buildStale(root), false);
});
