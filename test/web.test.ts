import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { buildStale, serveLoop } from '../src/web.ts';

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

test('a newer file in extensions/, such as the Installed record, makes it stale', () => {
  touch('web/.next/BUILD_ID', 50);
  touch('extensions/learn/belay.json', 100);
  assert.equal(buildStale(root), false);
  touch('extensions/installed.json', 10);
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

test('serve prepares and starts Next again while it exits leaving the restart marker, clearing a stale one first', async () => {
  const marker = join(root, '.run', 'serve-restart');
  touch('.run/serve-restart', 0);
  const seen: string[] = [];
  let runs = 0;
  const code = await serveLoop(marker, {
    prepare: () => void seen.push(`prepare ${existsSync(marker)}`),
    async start() {
      seen.push('start');
      if (++runs < 3) writeFileSync(marker, '');
      return runs;
    },
  });
  assert.equal(code, 3);
  assert.deepEqual(seen, ['prepare false', 'start', 'prepare false', 'start', 'prepare false', 'start']);
});
