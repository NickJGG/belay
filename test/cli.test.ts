import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'belay-'));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function belay(...args: string[]) {
  return belayWith(undefined, ...args);
}

/** `input` is piped to stdin, as the hooks get it. */
function belayWith(input: string | undefined, ...args: string[]) {
  const env = {
    ...process.env,
    BELAY_DATA: dir,
    CLAUDECODE: '',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  const r = spawnSync(process.execPath, ['src/cli.ts', ...args], { env, encoding: 'utf8', input });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('help prints the usage', () => {
  const r = belay('help');
  assert.equal(r.code, 0);
  assert.match(r.out, /^belay — what should I work on\?/);
});

test('an unknown command exits 1 with a belay: error', () => {
  const r = belay('frobnicate');
  assert.equal(r.code, 1);
  assert.match(r.err, /^belay: unknown command 'frobnicate'/);
});

test('project add, add, set, show', () => {
  assert.match(belay('project', 'add', 'PIX', '--name', 'Pixel', '--path', dir).out, /added project PIX/);
  assert.equal(belay('add', 'Draw the map', '--project', 'pix').out.trim(), 'added PIX-1 (todo): Draw the map');
  assert.equal(belay('set', 'pix-1', 'doing').out.trim(), 'PIX-1: todo → doing');
  const show = belay('show', 'PIX-1');
  assert.equal(show.code, 0);
  assert.match(show.out, /^PIX-1 {2}Draw the map\nstatus: {5}doing\n/);
});

test('settings prints, then updates', () => {
  assert.match(belay('settings').out, /^theme: {2}system\naccent: coral/);
  assert.match(belay('settings', '--theme', 'dark', '--accent', 'teal').out, /^theme: {2}dark\naccent: teal/);
  const bad = belay('settings', '--accent', 'chartreuse');
  assert.equal(bad.code, 1);
  assert.match(bad.err, /^belay: accent must be one of/);
});

test('git init starts history once', () => {
  const first = belay('git', 'init');
  assert.equal(first.code, 0, first.err);
  assert.equal(existsSync(join(dir, '.git')), true);
  const second = belay('git', 'init');
  assert.equal(second.code, 1);
  assert.match(second.err, /already has git history/);
});

test('a corrupt issue: read commands carry on and say so, writes refuse', () => {
  belay('project', 'add', 'PIX', '--name', 'Pixel', '--path', dir);
  belay('add', 'Draw the map', '--project', 'pix');
  belay('set', 'pix-1', 'doing');
  writeFileSync(join(dir, 'issues', 'pix-2.md'), '---\nid: PIX-2\ntitle: a: b: c\n---\n');
  const status = belayWith(JSON.stringify({ cwd: dir }), 'statusline');
  assert.equal(status.code, 0, status.err);
  assert.match(status.out, /PIX-1.*│ ⚠ 1 bad file\n$/);
  const list = belay('list');
  assert.match(list.out, /PIX-1/);
  assert.match(list.err, /^belay: skipped 1 bad file: issues\/pix-2\.md \(line 3: /);
  const set = belay('set', 'pix-1', 'todo');
  assert.equal(set.code, 1);
  assert.match(set.err, /^belay: issues\/pix-2\.md: line 3: /);
});
