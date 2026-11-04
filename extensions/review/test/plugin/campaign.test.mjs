import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { git, gitRepo, tempDir, writeFiles } from './helpers.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugin', 'scripts', 'campaign.mjs');

function campaign(home, repo, command, ...args) {
  const res = spawnSync(process.execPath, [SCRIPT, command, '--repo', repo, ...args], {
    encoding: 'utf8',
    env: { ...process.env, BELAY_DATA: home },
  });
  let json = null;
  try {
    json = JSON.parse(res.stdout);
  } catch {}
  return { code: res.status, stderr: res.stderr, json };
}

const body = (kb) => `${'x'.repeat(1023)}\n`.repeat(kb);

function repoWithModules() {
  return gitRepo({
    'alpha/a.ts': body(70),
    'beta/b.ts': body(80),
    'tiny/t.ts': body(1),
    'wee/w.ts': body(1),
    '.env': 'SECRET=1',
    'package-lock.json': '{}',
  });
}

test('status before init exits 3 and points at init', () => {
  assert.equal(campaign(tempDir(), repoWithModules(), 'status').code, 3);
});

test('init writes nothing in the repo, and maps units with exclusions', () => {
  const home = tempDir();
  const repo = repoWithModules();
  const r = campaign(home, repo, 'init');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.json.dir.startsWith(home));
  assert.equal(git(repo, 'status', '--porcelain'), '');
  const names = r.json.order.map((u) => u.name).sort();
  assert.deepEqual(names, ['(small modules)', 'alpha', 'beta']);
  const reasons = Object.fromEntries(r.json.excluded.map((e) => [e.path, e.reason]));
  assert.equal(reasons['.env'], 'secret');
  assert.equal(reasons['package-lock.json'], 'lockfile');
});

test('init refuses to overwrite a campaign without --force', () => {
  const home = tempDir();
  const repo = repoWithModules();
  campaign(home, repo, 'init');
  assert.equal(campaign(home, repo, 'init').code, 3);
  assert.equal(campaign(home, repo, 'init', '--force').code, 0);
});

test('the riskiest unit goes first: fix commits outweigh plain ones', () => {
  const home = tempDir();
  const repo = repoWithModules();
  writeFiles(repo, { 'beta/b.ts': `${body(80)}y\n` });
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'fix crash in beta');
  assert.equal(campaign(home, repo, 'init').json.order[0].name, 'beta');
});

test('a module over the limit splits at folder level, and a flat one by size', () => {
  const home = tempDir();
  const repo = gitRepo({
    'big/one/a.ts': body(300),
    'big/two/b.ts': body(300),
    'big/c.ts': body(70),
    'flat/a.ts': body(300),
    'flat/b.ts': body(300),
  });
  const names = campaign(home, repo, 'init').json.order.map((u) => u.name).sort();
  assert.deepEqual(names, ['big/(files)', 'big/one', 'big/two', 'flat (1/2)', 'flat (2/2)']);
});

test('next, record and status walk the units, then the cross-module step', () => {
  const home = tempDir();
  const repo = repoWithModules();
  campaign(home, repo, 'init');
  const merged = join(tempDir(), 'merged.json');
  writeFileSync(merged, JSON.stringify([{ root_cause_key: 'k:a:one', severity: 'CRITICAL', reviewer: 'x', verdict: 'confirmed' }]));

  const seen = [];
  for (let i = 0; i < 3; i++) {
    const next = campaign(home, repo, 'next').json;
    assert.equal(next.kind, 'unit');
    assert.ok(next.paths.length > 0);
    assert.equal(next.position, i + 1);
    seen.push(next.name);
    assert.equal(campaign(home, repo, 'record', '--unit', next.name, '--merged', merged).code, 0);
  }
  assert.equal(new Set(seen).size, 3);
  assert.equal(campaign(home, repo, 'status').json.done, 3);
  assert.equal(campaign(home, repo, 'next').json.kind, 'cross-module');
  campaign(home, repo, 'record', '--unit', '(cross-module)', '--merged', merged);
  assert.equal(campaign(home, repo, 'next').json.kind, 'finished');
});

test('rollup merges a root cause found in several units and names what is pending', () => {
  const home = tempDir();
  const repo = repoWithModules();
  const { order } = campaign(home, repo, 'init').json;
  const a = join(tempDir(), 'a.json');
  writeFileSync(a, JSON.stringify([{ root_cause_key: 'k:x:same', severity: 'DEBT', reviewer: 'r1' }]));
  const b = join(tempDir(), 'b.json');
  writeFileSync(b, JSON.stringify([{ root_cause_key: 'k:x:same', severity: 'CRITICAL', reviewer: 'r2' }]));
  campaign(home, repo, 'record', '--unit', order[0].name, '--merged', a);
  campaign(home, repo, 'record', '--unit', order[1].name, '--merged', b);
  const r = campaign(home, repo, 'rollup').json;
  assert.equal(r.groups, 1);
  assert.equal(r.findings, 2);
  assert.deepEqual(r.pending, [order[2].name]);
  const groups = JSON.parse(readFileSync(r.rollup, 'utf8'));
  assert.equal(groups[0].severity, 'CRITICAL');
  assert.deepEqual(groups[0].found_by, ['r1', 'r2']);
});

test('status flags a finished unit whose files changed since the campaign began', () => {
  const home = tempDir();
  const repo = repoWithModules();
  campaign(home, repo, 'init');
  const merged = join(tempDir(), 'm.json');
  writeFileSync(merged, '[]');
  campaign(home, repo, 'record', '--unit', 'alpha', '--merged', merged);
  writeFiles(repo, { 'alpha/a.ts': 'changed\n' });
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'touch');
  const status = campaign(home, repo, 'status').json;
  assert.equal(status.headMoved, true);
  assert.deepEqual(status.stale, ['alpha']);
});

test('record rejects an unknown unit or a bad file', () => {
  const home = tempDir();
  const repo = repoWithModules();
  campaign(home, repo, 'init');
  const merged = join(tempDir(), 'm.json');
  writeFileSync(merged, '{}');
  assert.equal(campaign(home, repo, 'record', '--unit', 'alpha', '--merged', merged).code, 2);
  writeFileSync(merged, '[]');
  assert.equal(campaign(home, repo, 'record', '--unit', 'nope', '--merged', merged).code, 2);
  assert.equal(campaign(home, repo, 'bogus').code, 2);
});
